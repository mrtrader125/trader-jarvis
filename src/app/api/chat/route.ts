// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groqClient } from "@/lib/groq";
import { getNowInfo } from "@/lib/time";
import {
  isPercentOfTargetQuestion,
  buildPercentOfTargetAnswerFromText,
} from "@/lib/jarvis/math";
import { loadFinance, buildFinanceContextSnippet } from "@/lib/jarvis/finance";
import { buildKnowledgeContext } from "@/lib/jarvis/knowledge/context";

export const runtime = "nodejs";

/** Types */
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: string;
  created_at?: string;
};

/** Utility: detect simple time questions */
function isTimeQuestion(text?: string | null) {
  if (!text) return false;
  const q = text.toLowerCase();
  return (
    q.includes("current time") ||
    q.includes("time now") ||
    q.includes("what's the time") ||
    q.includes("whats the time") ||
    q === "time?" ||
    q === "time"
  );
}

/** Simple intent tagger used to fetch relevant Knowledge Center blocks */
function detectIntentTags(text?: string | null): string[] {
  if (!text) return ["general"];
  const q = text.toLowerCase();
  const tags: string[] = [];

  if (
    q.includes("trade") ||
    q.includes("trading") ||
    q.includes("entry") ||
    q.includes("stop loss") ||
    q.includes("risk") ||
    q.includes("prop firm") ||
    q.includes("evaluation") ||
    q.includes("chart")
  ) {
    tags.push("trading");
  }

  if (
    q.includes("psychology") ||
    q.includes("emotion") ||
    q.includes("fear") ||
    q.includes("revenge") ||
    q.includes("discipline") ||
    q.includes("tilt") ||
    q.includes("mindset")
  ) {
    tags.push("psychology");
  }

  if (
    q.includes("money") ||
    q.includes("salary") ||
    q.includes("expenses") ||
    q.includes("freedom") ||
    q.includes("runway") ||
    q.includes("minimum required")
  ) {
    tags.push("money", "freedom");
  }

  if (tags.length === 0) tags.push("general");
  return tags;
}

/** Helper: parse numeric chat id candidates safely */
function parseChatId(candidate: any): number | null {
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (/^-?\d+$/.test(trimmed)) {
      try {
        return Number(trimmed);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Send message to Telegram using bot token; returns { ok, result|error, raw? } with human-friendly error
 *  NOTE: this function expects a numeric chatId (validated) to avoid "chat not found" errors */
async function sendTelegramText(chatIdNum: number, text: string) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" };
  }

  if (!chatIdNum && chatIdNum !== 0) {
    console.error("Missing numeric chat id for Telegram send");
    return { ok: false, error: "Missing chat id" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatIdNum,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    // parse response safely
    let json: any = null;
    try {
      json = await res.json();
    } catch (parseErr) {
      console.warn("Telegram response not JSON:", parseErr);
      const txt = await res.text();
      return { ok: res.ok, error: txt || `HTTP ${res.status}` };
    }

    if (!res.ok) {
      const desc = json?.description ?? json?.error ?? JSON.stringify(json);
      console.error("Telegram API returned error:", desc, json);
      return { ok: false, error: desc, raw: json };
    }

    return { ok: true, result: json, raw: json };
  } catch (err: any) {
    console.error("Telegram send exception:", err);
    return { ok: false, error: String(err) };
  }
}

/** Save reminder row to supabase */
async function saveReminderToSupabase(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sendAtIso: string,
  message: string
) {
  try {
    const payload = {
      user_id: userId,
      send_at: sendAtIso,
      message,
      status: "scheduled",
    };
    const { data, error } = await supabase.from("jarvis_reminders").insert([payload]).select().single();
    if (error) {
      console.error("Error inserting reminder:", error);
      return { ok: false, error };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("Exception saving reminder:", err);
    return { ok: false, error: String(err) };
  }
}

/** Extract first JSON object from text (handles fenced ```json blocks and trailing commas) */
function extractFirstJsonObject(text?: string | null): any | null {
  if (!text) return null;
  const fenceMatch = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  let candidate = fenceMatch ? fenceMatch[1] : text;

  const start = candidate.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const jsonText = candidate.slice(start, i + 1);
        try {
          return JSON.parse(jsonText);
        } catch (e) {
          try {
            const cleaned = jsonText.replace(/,(\s*[}\]])/g, "$1");
            return JSON.parse(cleaned);
          } catch (e2) {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/** Remove the first JSON block (fenced ```json``` section or first {...}) from text and return cleaned string */
function removeFirstJsonBlock(text?: string | null): string {
  if (!text) return "";
  const fenced = /```(?:json)?\n([\s\S]*?)\n```/i;
  if (fenced.test(text)) {
    return text.replace(fenced, "").trim();
  }
  const start = text.indexOf("{");
  if (start === -1) return text.trim();
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const cleaned = (text.slice(0, start) + text.slice(i + 1)).trim();
        return cleaned;
      }
    }
  }
  return text.trim();
}

/** Main handler */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: ChatMessage[] = body?.messages ?? [];

    const supabase = createClient();

    // --- Load profile ---
    let profile: any = null;
    try {
      const { data, error } = await supabase
        .from("jarvis_profile")
        .select("*")
        .eq("user_id", "single-user")
        .single();

      if (error) {
        console.error("Error loading jarvis_profile:", error.message || error);
      } else {
        profile = data;
      }
    } catch (err) {
      console.error("Exception loading jarvis_profile:", err);
    }

    // --- Load finance snapshot ---
    const finance = await loadFinance(supabase);
    const financeSnippet = buildFinanceContextSnippet(finance);

    // --- Time & last message parsing ---
    const timezone: string = profile?.timezone || "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    const lastMessage = messages[messages.length - 1];
    const lastUserContent = lastMessage?.role === "user" ? lastMessage.content : undefined;

    // 0) time question handled server-side
    if (isTimeQuestion(lastUserContent)) {
      const reply = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;
      return NextResponse.json({ reply }, { status: 200 });
    }

    // 0.5) percent-of-target math handled server-side
    if (lastUserContent && isPercentOfTargetQuestion(lastUserContent)) {
      const answer = buildPercentOfTargetAnswerFromText(lastUserContent);
      if (answer) {
        return NextResponse.json({ reply: answer }, { status: 200 });
      }
    }

    // 1) tag user messages with [sent_at: ...]
    const messagesWithTime = messages.map((m) => {
      const sentAt = m.createdAt || m.created_at || new Date().toISOString();
      if (m.role === "user") {
        return {
          role: m.role,
          content: `[sent_at: ${sentAt}] ${m.content}`,
        };
      }
      return { role: m.role, content: m.content };
    });

    // 2) Knowledge Center
    const intentTags = detectIntentTags(lastUserContent);
    const knowledgeBlocks = await buildKnowledgeContext({
      intentTags,
      maxItems: 8,
    });

    const knowledgeSection =
      knowledgeBlocks.length === 0
        ? "No explicit user knowledge has been defined yet."
        : knowledgeBlocks
            .map(
              (b) => `
### ${b.title} [${b.item_type}, importance ${b.importance}]
${b.content}

${b.instructions ? `How Jarvis must use this:\n${b.instructions}\n` : ""}`
            )
            .join("\n");

    // 3) Build system prompt (includes server-action rules)
    const displayName = profile?.display_name || "Bro";
    const bio = profile?.bio || "Disciplined trader building systems to control impulses and grow steadily.";
    const mainGoal = profile?.main_goal || "Become a consistently profitable, rule-based trader.";
    const currentFocus = profile?.current_focus || "Discipline over profits.";

    const typicalWake = profile?.typical_wake_time || "06:30";
    const typicalSleep = profile?.typical_sleep_time || "23:30";
    const sessionStart = profile?.trading_session_start || "09:15";
    const sessionEnd = profile?.trading_session_end || "15:30";

    const strictness = profile?.strictness_level ?? 8;
    const empathy = profile?.empathy_level ?? 7;
    const humor = profile?.humor_level ?? 5;

    const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE user in SINGLE-USER mode.
You are allowed to instruct the server to perform actions (send Telegram messages, schedule reminders).
When you need the server to perform an action, output a single JSON object (no other text in the same JSON block). Example:

\`\`\`json
{
  "action": "send_telegram",
  "chat_id": 123456789,
  "text": "Bro — quick reminder: check your daily limits."
}
\`\`\`

or

\`\`\`json
{
  "action": "schedule_reminder",
  "time": "2025-12-09T10:00:00.000Z",
  "text": "Reminder: close trades and review risk."
}
\`\`\`

Rules:
- The model should produce the JSON object only when it truly intends to trigger a server action.
- If both conversational reply and action are needed, prefer returning a short assistant message followed by a separate JSON action block.
- The server will parse the first JSON object it finds and execute it.

USER ID: "single-user"

User identity:
- Name you call him: ${displayName}
- Bio: ${bio}
- Main goal: ${mainGoal}
- Current focus: ${currentFocus}

User routine:
- Timezone: ${timezone}
- Typical wake time: ${typicalWake}
- Typical sleep time: ${typicalSleep}
- Trading session: ${sessionStart} - ${sessionEnd}

Personality sliders (0–10):
- Strictness: ${strictness}
- Empathy: ${empathy}
- Humor: ${humor}

Current time (FOR INTERNAL REASONING ONLY, DO NOT SAY THIS UNLESS THE USER ASKS ABOUT TIME):
- ISO: ${nowInfo.iso}
- Local: ${nowInfo.localeString}
- Timezone: ${nowInfo.timezone}

[sent_at: ...] TAGS:
- User messages may start with [sent_at: ISO_DATE] at the front.
- This is metadata only. Use it to infer how long it's been since the last message.
- NEVER print the [sent_at: ...] tag or raw ISO timestamps back to the user.

${financeSnippet}

USER TEACHINGS (KNOWLEDGE CENTER):
${knowledgeSection}

CONVERSATION & LISTENING:
- Be strict but caring.
- ALWAYS extract numbers and compute before coaching.
- For "send to Telegram" or "remind me at ..." requests, produce a JSON action object as shown above.
`.trim();

    const finalMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messagesWithTime,
    ];

    // 4) Call Groq LLM
    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: finalMessages,
      stream: false,
    });

    const replyMessage = completion.choices?.[0]?.message as any;

    const replyContent =
      typeof replyMessage?.content === "string"
        ? replyMessage.content
        : Array.isArray(replyMessage?.content)
        ? replyMessage.content.map((c: any) => (typeof c === "string" ? c : c.text ?? "")).join("\n")
        : "Sorry, I couldn't generate a response.";

    // --- ACTION PARSING & HANDLING ---
    const maybeAction = extractFirstJsonObject(replyContent);

    let actionResultSummary: string | null = null;

    if (maybeAction && maybeAction.action) {
      const action = maybeAction.action;
      try {
        if (action === "send_telegram") {
          const text: string = maybeAction.text ?? "";

          // NEW: resolve chat target safely (prefer numeric model chat_id, then profile, then env)
          const modelCandidate = maybeAction.chat_id ?? null;
          let chatTarget = parseChatId(modelCandidate);

          if (!chatTarget && profile?.telegram_chat_id) {
            chatTarget = parseChatId(profile.telegram_chat_id);
          }

          if (!chatTarget && process.env.TELEGRAM_CHAT_ID) {
            chatTarget = parseChatId(process.env.TELEGRAM_CHAT_ID);
          }

          if (!chatTarget) {
            // fail gracefully — do not call Telegram with invalid id
            actionResultSummary =
              "Failed to send: no valid chat id found. Open the bot in Telegram and press Start so Jarvis can message you, or set TELEGRAM_CHAT_ID in env.";
          } else {
            // call sendTelegramText with numeric chat id
            const tg = await sendTelegramText(Number(chatTarget), text);

            // log to supabase (optional telemetry)
            try {
              await supabase.from("jarvis_notifications").insert([
                {
                  user_id: "single-user",
                  type: "telegram",
                  payload: { action: "send_telegram", chat_id: chatTarget, text },
                  result: tg,
                  created_at: new Date().toISOString(),
                },
              ]);
            } catch (e) {
              console.error("Log notification error:", e);
            }

            const tgError = tg.error;
            const tgErrorMsg =
              typeof tgError === "string"
                ? tgError
                : tgError && typeof tgError === "object"
                ? (tgError.description ?? tgError.error ?? JSON.stringify(tgError))
                : String(tgError);

            actionResultSummary = tg.ok ? "Sent to Telegram." : `Telegram send failed: ${tgErrorMsg}`;
          }
        } else if (action === "schedule_reminder") {
          const time = maybeAction.time;
          const text = maybeAction.text ?? "";
          if (!time) {
            console.error("schedule_reminder missing time");
            actionResultSummary = "Failed to schedule reminder: missing time.";
          } else {
            const saveRes = await saveReminderToSupabase(supabase, "single-user", time, text);
            if (saveRes.ok) {
              actionResultSummary = `Reminder scheduled for ${time}.`;
              // immediate send if time <= now
              try {
                if (saveRes.data?.id && new Date(time).getTime() <= Date.now()) {
                  const chatIdEnv = process.env.TELEGRAM_CHAT_ID;
                  const chatIdNum = parseChatId(chatIdEnv);
                  if (chatIdNum) {
                    const sendRes = await sendTelegramText(chatIdNum, text);
                    if (sendRes.ok) {
                      await supabase
                        .from("jarvis_reminders")
                        .update({ status: "sent", sent_at: new Date().toISOString() })
                        .eq("id", saveRes.data.id);
                      actionResultSummary = `Reminder scheduled and sent immediately.`;
                    } else {
                      const sendErr = sendRes.error;
                      const sendErrMsg =
                        typeof sendErr === "string"
                          ? sendErr
                          : sendErr && typeof sendErr === "object"
                          ? (sendErr.description ?? sendErr.error ?? JSON.stringify(sendErr))
                          : String(sendErr);
                      actionResultSummary = `Reminder scheduled but immediate send failed: ${sendErrMsg}`;
                    }
                  } else {
                    actionResultSummary = `Reminder scheduled but immediate send skipped: no valid chat id in env.`;
                  }
                }
              } catch (e) {
                console.error("Immediate send for scheduled reminder failed:", e);
              }
            } else {
              actionResultSummary = `Failed to schedule reminder: ${String(saveRes.error)}`;
            }
          }
        } else {
          console.log("Unknown action from model:", action);
          actionResultSummary = `Unknown action: ${action}`;
        }
      } catch (e) {
        console.error("Error handling action:", e);
        actionResultSummary = `Error executing action: ${String(e)}`;
      }
    }

    // Remove JSON action block from assistant reply before returning to client
    const cleanedReply = removeFirstJsonBlock(replyContent).trim();

    // If cleaned reply is empty (model only returned JSON), synthesize a confirmation reply
    let finalReplyToClient = cleanedReply;
    if (!finalReplyToClient) {
      if (maybeAction && maybeAction.action) {
        finalReplyToClient = actionResultSummary || "Action executed.";
      } else {
        finalReplyToClient = "Okay — I did not find anything to say.";
      }
    }

    // Return the assistant's cleaned reply to the client
    return NextResponse.json({ reply: finalReplyToClient }, { status: 200 });
  } catch (error: unknown) {
    console.error("CHAT API ERROR:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ reply: "Jarvis brain crashed: " + message }, { status: 200 });
  }
}
