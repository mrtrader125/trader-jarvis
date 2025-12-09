// src/app/api/chat/route.ts
"use server";

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

/**
 * Chat route with action handling:
 * - Parses LLM reply for JSON action objects and executes them server-side.
 * - Actions supported: send_telegram, schedule_reminder.
 */

// Types
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: string;
  created_at?: string;
};

function isTimeQuestion(text: string | undefined | null): boolean {
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

/** Simple tag detector for knowledge/context relevance */
function detectIntentTags(text: string | undefined): string[] {
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

/** send message to Telegram using bot token and chat_id */
async function sendTelegramText(chatId: number | string, text: string) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return { ok: false, error: "Missing token" };
  }

  const CHAT_ID = chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!CHAT_ID) {
    console.error("Missing TELEGRAM_CHAT_ID and chatId not provided");
    return { ok: false, error: "Missing chat id" };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          parse_mode: "Markdown",
        }),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      console.error("Telegram send error:", json);
      return { ok: false, error: json };
    }
    return { ok: true, result: json };
  } catch (err) {
    console.error("Telegram send exception:", err);
    return { ok: false, error: String(err) };
  }
}

/** Save reminder to supabase table jarvis_reminders */
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

/** Try extract first JSON object block from text */
function extractFirstJsonObject(text: string): any | null {
  if (!text) return null;
  // trim code fences if any
  const fenceMatch = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  let candidate = fenceMatch ? fenceMatch[1] : text;

  // find first { ... } block by matching braces
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
          // try a relaxed parse: remove trailing commas
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: ChatMessage[] = body?.messages ?? [];

    const supabase = createClient();

    // -- load profile
    let profile: any = null;
    try {
      const { data, error } = await supabase
        .from("jarvis_profile")
        .select("*")
        .eq("user_id", "single-user")
        .single();

      if (error) {
        console.error("Error loading jarvis_profile:", error);
      } else {
        profile = data;
      }
    } catch (err) {
      console.error("Exception loading jarvis_profile:", err);
    }

    // load finance
    const finance = await loadFinance(supabase);

    const timezone: string = profile?.timezone || "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    const lastMessage = messages[messages.length - 1];
    const lastUserContent =
      lastMessage?.role === "user" ? lastMessage.content : undefined;

    // 0) time questions handled server-side
    if (isTimeQuestion(lastUserContent)) {
      const reply = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;
      return NextResponse.json({ reply }, { status: 200 });
    }

    // 0.5) percent-of-target math
    if (lastUserContent && isPercentOfTargetQuestion(lastUserContent)) {
      const answer = buildPercentOfTargetAnswerFromText(lastUserContent);
      if (answer) {
        return NextResponse.json({ reply: answer }, { status: 200 });
      }
    }

    // 1) tag user messages with sent_at metadata
    const messagesWithTime = messages.map((m) => {
      const sentAt =
        m.createdAt ||
        m.created_at ||
        new Date().toISOString();

      if (m.role === "user") {
        return {
          role: m.role,
          content: `[sent_at: ${sentAt}] ${m.content}`,
        };
      }

      return {
        role: m.role,
        content: m.content,
      };
    });

    // 2) Build Knowledge Center context
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

${
  b.instructions
    ? `How Jarvis must use this:\n${b.instructions}\n`
    : ""
}`
            )
            .join("\n");

    // 3) Build system prompt (updated to allow server actions)
    const displayName = profile?.display_name || "Bro";
    const bio =
      profile?.bio ||
      "Disciplined trader building systems to control impulses and grow steadily.";
    const mainGoal =
      profile?.main_goal ||
      "Become a consistently profitable, rule-based trader.";
    const currentFocus =
      profile?.current_focus || "December: Discipline over profits.";

    const typicalWake = profile?.typical_wake_time || "06:30";
    const typicalSleep = profile?.typical_sleep_time || "23:30";
    const sessionStart = profile?.trading_session_start || "09:15";
    const sessionEnd = profile?.trading_session_end || "15:30";

    const strictness = profile?.strictness_level ?? 8;
    const empathy = profile?.empathy_level ?? 7;
    const humor = profile?.humor_level ?? 5;

    const financeSnippet = buildFinanceContextSnippet(finance);

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

Rules for actions:
- The model should produce the JSON object only when it truly intends to trigger that server action.
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
- Extract numbers and compute before coaching.
- If user asks "send to Telegram" or "remind me at ...", produce appropriate JSON action as shown above.
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
        ? replyMessage.content
            .map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
            .join("\n")
        : "Sorry, I couldn't generate a response.";

    // --- ACTION PARSING & HANDLING ---
    const maybeAction = extractFirstJsonObject(replyContent);

    if (maybeAction && maybeAction.action) {
      const action = maybeAction.action;
      try {
        if (action === "send_telegram") {
          const text: string = maybeAction.text ?? "";
          const chatId = maybeAction.chat_id ?? process.env.TELEGRAM_CHAT_ID;
          // send now
          const tg = await sendTelegramText(chatId, text);
          // log to supabase messages (optional)
          try {
            await supabase.from("jarvis_notifications").insert([
              {
                user_id: "single-user",
                type: "telegram",
                payload: { action: "send_telegram", chat_id: chatId, text },
                result: tg,
              },
            ]);
          } catch (e) {
            // not critical
            console.error("Log notification error:", e);
          }
        } else if (action === "schedule_reminder") {
          const time = maybeAction.time;
          const text = maybeAction.text ?? "";
          if (!time) {
            console.error("schedule_reminder missing time");
          } else {
            const saveRes = await saveReminderToSupabase(supabase, "single-user", time, text);
            // if scheduled time is <= now, send immediately and mark sent
            if (new Date(time).getTime() <= Date.now()) {
              const chatId = process.env.TELEGRAM_CHAT_ID;
              const sendRes = await sendTelegramText(chatId!, text);
              if (sendRes.ok) {
                // update reminder row if present
                try {
                  if (saveRes.ok && saveRes.data?.id) {
                    await supabase
                      .from("jarvis_reminders")
                      .update({ status: "sent", sent_at: new Date().toISOString() })
                      .eq("id", saveRes.data.id);
                  }
                } catch (e) {
                  console.error("Failed to update reminder status", e);
                }
              } else {
                console.error("Immediate send failed for scheduled reminder", sendRes);
              }
            }
          }
        } else {
          console.log("Unknown action from model:", action);
        }
      } catch (e) {
        console.error("Error handling action:", e);
      }
    }

    // Return the assistant's whole reply to web chat (including any JSON block)
    return NextResponse.json({ reply: replyContent }, { status: 200 });
  } catch (error: unknown) {
    console.error("CHAT API ERROR:", error);
    const message =
      error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { reply: "Jarvis brain crashed: " + message },
      { status: 200 }
    );
  }
}
