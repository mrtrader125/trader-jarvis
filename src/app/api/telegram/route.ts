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

import FormData from "form-data"; // npm install form-data when running locally

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

/** Sends simple text message to Telegram */
async function sendTelegramText(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return { ok: false, error: "missing_token" };
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
    const json = await res.json();
    return { ok: res.ok, result: json };
  } catch (err: any) {
    console.error("sendTelegramText error:", err);
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
    // append Buffer as file
    form.append("voice", audioBuffer, {
      filename: "jarvis.ogg",
      contentType: "audio/ogg",
    } as any);

    // form.getHeaders() needed for Node to set the multipart boundary
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`, {
      method: "POST",
      body: form as any,
      // @ts-ignore
      headers: form.getHeaders ? form.getHeaders() : undefined,
    });

    const json = await res.json();
    return { ok: res.ok, result: json };
  } catch (err: any) {
    console.error("sendTelegramVoice error:", err);
    return { ok: false, error: String(err) };
  }
}

/** Use Deepgram (or alternative) to synthesize TTS; returns Buffer or null */
async function synthesizeTTS(text: string): Promise<Buffer | null> {
  if (!DEEPGRAM_API_KEY) {
    // optional: do not fail the main flow if TTS key missing
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

    // Persist telegram_chat_id on profile (so reminders and other server actions know where to send)
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

    // 0) Time-only question handled locally (no LLM call)
    if (isTimeQuestion(userText)) {
      const replyRaw = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;
      const reply = stripSentAtPrefix(replyRaw);
      await sendTelegramText(chatId, reply);
      const audio = await synthesizeTTS(reply);
      if (audio) await sendTelegramVoice(chatId, audio);
      return NextResponse.json({ ok: true });
    }

    // 0.5) Percent-of-target deterministic math handled locally
    if (isPercentOfTargetQuestion(userText)) {
      const reply = buildPercentOfTargetAnswerFromText(userText);
      if (reply) {
        await sendTelegramText(chatId, reply);
        const audio = await synthesizeTTS(reply);
        if (audio) await sendTelegramVoice(chatId, audio);
        return NextResponse.json({ ok: true });
      }
    }

    // 0.6) If user likely answered an earlier "which setup" with an instrument, confirm
    if (likelyAnswersSetupQuestion(userText)) {
      const short = `Got it — ${userText}. Give me account/risk numbers if you want immediate analysis.`;
      await sendTelegramText(chatId, short);
      const shortAudio = await synthesizeTTS(short);
      if (shortAudio) await sendTelegramVoice(chatId, shortAudio);
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

    const rawReply = completion.choices?.[0]?.message?.content || "Got it, Bro.";
    const replyText = stripSentAtPrefix(rawReply);

    // 4) Send reply text and optional voice
    await sendTelegramText(chatId, replyText);
    const audio = await synthesizeTTS(replyText);
    if (audio) await sendTelegramVoice(chatId, audio);

    // 5) (optional) Log to table for analytics — do not block response if logging fails
    (async () => {
      try {
        await supabase.from("jarvis_conversation_logs").insert([
          {
            user_id: "single-user",
            channel: "telegram",
            incoming: { text: userText, sent_at: sentAtIso },
            outgoing: { text: replyText, model: process.env.GROQ_MODEL || "unknown" },
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (e) {
        console.warn("Failed to log conversation (non-blocking):", e);
      }
    })();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TELEGRAM WEBHOOK ERROR:", err);
    // return ok=true to avoid Telegram retry storms; optionally notify admin in production
    return NextResponse.json({ ok: true });
  }
}
