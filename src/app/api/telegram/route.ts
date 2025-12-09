// src/app/api/telegram/route.ts
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

import FormData from "form-data";

export const runtime = "nodejs";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    date?: number;
  };
};

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

function stripSentAtPrefix(text: string) {
  return text.replace(/^\s*\[sent_at:[^\]]*\]\s*/i, "");
}

function detectIntentTags(text?: string | null): string[] {
  if (!text) return ["general"];
  const q = text.toLowerCase();
  const tags: string[] = [];

  if (
    q.includes("trade") ||
    q.includes("trading") ||
    q.includes("chart") ||
    q.includes("entry") ||
    q.includes("stop loss") ||
    q.includes("risk") ||
    q.includes("prop firm") ||
    q.includes("evaluation")
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
    q.includes("worry free") ||
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

/** Sends simple text message to Telegram (safe error extraction)
 *  This expects a numeric chatId (validated) */
async function sendTelegramText(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

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
    console.error("sendTelegramText exception:", err);
    return { ok: false, error: String(err) };
  }
}

/** Sends voice audio buffer to Telegram as voice note */
async function sendTelegramVoice(chatId: number, audioBuffer: Buffer) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN for voice send");
    return { ok: false, error: "missing_token" };
  }

  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("voice", audioBuffer, {
      filename: "jarvis.ogg",
      contentType: "audio/ogg",
    } as any);

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`, {
      method: "POST",
      body: form as any,
      // @ts-ignore
      headers: form.getHeaders ? form.getHeaders() : undefined,
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch (parseErr) {
      console.warn("Telegram voice response not JSON:", parseErr);
      const txt = await res.text();
      return { ok: res.ok, error: txt || `HTTP ${res.status}` };
    }

    if (!res.ok) {
      const desc = json?.description ?? JSON.stringify(json);
      console.error("Telegram sendVoice error:", desc, json);
      return { ok: false, error: desc, raw: json };
    }

    return { ok: true, result: json, raw: json };
  } catch (err: any) {
    console.error("sendTelegramVoice exception:", err);
    return { ok: false, error: String(err) };
  }
}

/** Use Deepgram (or alternative) to synthesize TTS; returns Buffer or null */
async function synthesizeTTS(text: string): Promise<Buffer | null> {
  if (!DEEPGRAM_API_KEY) {
    console.warn("Missing DEEPGRAM_API_KEY — skipping TTS");
    return null;
  }

  try {
    const res = await fetch("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "audio/ogg",
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.error("Deepgram TTS error:", await res.text());
      return null;
    }

    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err: any) {
    console.error("synthesizeTTS exception:", err);
    return null;
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

/** Heuristic detection: user answered with an instrument/setup word */
function likelyAnswersSetupQuestion(text?: string | null) {
  if (!text) return false;
  const q = text.toLowerCase();
  const setupWords = [
    "gold",
    "silver",
    "nifty",
    "banknifty",
    "btc",
    "bitcoin",
    "eth",
    "ethereum",
    "eurusd",
    "usd",
    "usdjpy",
    "audusd",
    "nasdaq",
    "spy",
    "tesla",
    "goog",
  ];
  return setupWords.some((w) => q.includes(w));
}

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;

    // ignore non-text updates
    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userText = message.text;
    const sentAtIso = new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

    const supabase = createClient();

    // Persist telegram_chat_id on profile
    try {
      const { error } = await supabase
        .from("jarvis_profile")
        .upsert({ user_id: "single-user", telegram_chat_id: chatId }, { onConflict: "user_id" });
      if (error) console.error("Failed to upsert telegram_chat_id:", error.message || error);
    } catch (err) {
      console.error("Exception upserting telegram_chat_id:", err);
    }

    // Load profile
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

    // Finance snapshot & snippets
    const finance = await loadFinance(supabase);
    const financeSnippet = buildFinanceContextSnippet(finance);

    const timezone: string = profile?.timezone || "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

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

    // 0) Time-only question handled locally
    if (isTimeQuestion(userText)) {
      const replyRaw = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;
      const reply = stripSentAtPrefix(replyRaw);
      // use numeric chatId that came with update
      const chatNum = parseChatId(chatId);
      if (chatNum) await sendTelegramText(chatNum, reply);
      const audio = await synthesizeTTS(reply);
      if (audio && chatNum) await sendTelegramVoice(chatNum, audio);
      return NextResponse.json({ ok: true });
    }

    // 0.5) Percent-of-target deterministic math handled locally
    if (isPercentOfTargetQuestion(userText)) {
      const reply = buildPercentOfTargetAnswerFromText(userText);
      if (reply) {
        const chatNum = parseChatId(chatId);
        if (chatNum) await sendTelegramText(chatNum, reply);
        const audio = await synthesizeTTS(reply);
        if (audio && chatNum) await sendTelegramVoice(chatNum, audio);
        return NextResponse.json({ ok: true });
      }
    }

    // 0.6) If user likely answered an earlier "which setup" with an instrument, confirm
    if (likelyAnswersSetupQuestion(userText)) {
      const short = `Got it — ${userText}. Give me account/risk numbers if you want immediate analysis.`;
      const chatNum = parseChatId(chatId);
      if (chatNum) await sendTelegramText(chatNum, short);
      const shortAudio = await synthesizeTTS(short);
      if (shortAudio && chatNum) await sendTelegramVoice(chatNum, shortAudio);
      return NextResponse.json({ ok: true });
    }

    // 1) Knowledge Center context
    const intentTags = detectIntentTags(userText);
    const knowledgeBlocks = await buildKnowledgeContext({ intentTags, maxItems: 8 });

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

    // 2) Build system prompt
    const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE user, talking over Telegram.

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

[sent_at: ...] TAG:
- The user text may be wrapped as:
  [sent_at: 2025-12-07T08:22:54.281Z] actual text...
- This is METADATA ONLY. Use it to infer how long it's been since the last message.
- NEVER print the [sent_at: ...] tag or raw ISO timestamps.
- DO NOT invent your own [sent_at: ...] prefix in replies.

${financeSnippet}

USER TEACHINGS (KNOWLEDGE CENTER):
${knowledgeSection}

CONVERSATION & LISTENING (TELEGRAM):
- Be strict but caring; always extract numbers before coaching.
- For actionable requests (reminders, alerts) produce a JSON action object as described in system instructions (server parses it).
- Follow the MATH & LISTENING PROTOCOL (STRICT) from the user's Knowledge Center.
`.trim();

    const userMessageForModel = `[sent_at: ${sentAtIso}] ${userText}`;

    // 3) Call Groq / LLM
    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageForModel },
      ],
      stream: false,
    });

    const rawReply = (completion.choices?.[0]?.message?.content as string) || "Got it, Bro.";

    // Parse action JSON if present
    const maybeAction = extractFirstJsonObject(rawReply);

    let actionResultSummary: string | null = null;

    if (maybeAction && maybeAction.action) {
      try {
        const action = maybeAction.action;
        // ---------- Updated send_telegram handler (safe, validated chat id) ----------
        if (action === "send_telegram") {
          const actionText: string = maybeAction.text ?? "";
          const modelCandidate = maybeAction.chat_id ?? null;

          // 1) prefer model-provided numeric chat_id only if it's a valid integer
          let chatTarget = parseChatId(modelCandidate);

          // 2) fallback to saved profile value (strong preference)
          if (!chatTarget && profile?.telegram_chat_id) {
            chatTarget = parseChatId(profile.telegram_chat_id);
          }

          // 3) fallback to env TELEGRAM_CHAT_ID if present
          if (!chatTarget && process.env.TELEGRAM_CHAT_ID) {
            chatTarget = parseChatId(process.env.TELEGRAM_CHAT_ID);
          }

          // 4) if still no chatTarget, fail with friendly message rather than calling Telegram
          if (!chatTarget) {
            actionResultSummary =
              "Failed to send: no valid chat id found. Open the bot in Telegram and press Start so Jarvis can message you, or set TELEGRAM_CHAT_ID in env.";
          } else {
            // Ensure chatTarget is a number and call sendTelegramText
            const tg = await sendTelegramText(Number(chatTarget), String(actionText));

            // human-friendly error string extraction
            const tgError = tg.error;
            const tgErrorMsg =
              typeof tgError === "string"
                ? tgError
                : tgError && typeof tgError === "object"
                ? (tgError.description ?? tgError.error ?? JSON.stringify(tgError))
                : String(tgError);

            actionResultSummary = tg.ok ? "Sent to Telegram." : `Telegram send failed: ${tgErrorMsg}`;

            // optional telemetry logging (non-blocking)
            try {
              await supabase.from("jarvis_notifications").insert([
                {
                  user_id: "single-user",
                  type: "telegram",
                  payload: { action: "send_telegram", chat_id: chatTarget, text: actionText },
                  result: tg,
                  created_at: new Date().toISOString(),
                },
              ]);
            } catch (err) {
              console.warn("Failed to log notification:", err);
            }
          }
        }
        // ---------- schedule_reminder unchanged ----------
        else if (action === "schedule_reminder") {
          const time = maybeAction.time;
          const text = maybeAction.text ?? "";
          if (!time) {
            actionResultSummary = "Failed to schedule: missing time.";
          } else {
            const saveRes = await supabase.from("jarvis_reminders").insert([
              {
                user_id: "single-user",
                send_at: time,
                message: text,
                status: "scheduled",
              },
            ]);
            actionResultSummary = saveRes.error ? `Failed to schedule: ${String(saveRes.error)}` : `Reminder scheduled for ${time}.`;
          }
        } else {
          actionResultSummary = `Unknown action: ${maybeAction.action}`;
        }
      } catch (e) {
        console.error("Error executing action:", e);
        actionResultSummary = `Error executing action: ${String(e)}`;
      }
    }

    // Remove JSON block from model reply before sending to chat
    const assistantText = removeFirstJsonBlock(rawReply);
    const cleanedText = stripSentAtPrefix(assistantText).trim();

    // If model only returned JSON (cleanedText is empty), create a short confirmation message
    let finalOutgoingText = cleanedText;
    if (!finalOutgoingText) {
      finalOutgoingText = actionResultSummary || "Done. I scheduled the reminder / sent the message.";
    }

    // Send the cleaned reply to the user on Telegram
    const chatNumForReply = parseChatId(chatId);
    if (chatNumForReply) await sendTelegramText(chatNumForReply, finalOutgoingText);

    // Try sending voice if available
    const audio = await synthesizeTTS(finalOutgoingText).catch((e) => {
      console.warn("TTS failed:", e);
      return null;
    });
    if (audio && chatNumForReply) await sendTelegramVoice(chatNumForReply, audio);

    // Log conversation row asynchronously (non-blocking)
    (async () => {
      try {
        await supabase.from("jarvis_conversation_logs").insert([
          {
            user_id: "single-user",
            channel: "telegram",
            incoming: { text: userText, sent_at: sentAtIso },
            outgoing: { text: finalOutgoingText, model: process.env.GROQ_MODEL || "unknown" },
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (e) {
        console.warn("Failed to log conversation:", e);
      }
    })();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TELEGRAM WEBHOOK ERROR:", err);
    // return ok=true to avoid Telegram retry storms
    return NextResponse.json({ ok: true });
  }
}
