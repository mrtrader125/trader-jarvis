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

function stripSentAtPrefix(text: string): string {
  return text.replace(/^\s*\[sent_at:[^\]]*\]\s*/i, "");
}

async function sendTelegramText(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return;
  }

  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );
}

async function sendTelegramVoice(chatId: number, audio: ArrayBuffer) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN for voice send");
    return;
  }

  const form = new FormData();
  form.append("chat_id", String(chatId));

  const blob = new Blob([audio], { type: "audio/ogg" });
  // @ts-ignore Node FormData typing is a bit loose; this works at runtime
  form.append("voice", blob, "jarvis.ogg");

  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
    {
      method: "POST",
      // @ts-ignore Node FormData typing is a bit loose; this works at runtime
      body: form,
    }
  );
}

async function synthesizeTTS(text: string): Promise<ArrayBuffer | null> {
  if (!DEEPGRAM_API_KEY) {
    console.error("Missing DEEPGRAM_API_KEY");
    return null;
  }

  const res = await fetch(
    "https://api.deepgram.com/v1/speak?model=aura-asteria-en",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "audio/ogg",
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!res.ok) {
    console.error("Deepgram TTS error:", await res.text());
    return null;
  }

  return await res.arrayBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;

    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userText = message.text;
    const sentAtIso = new Date(
      (message.date ?? Math.floor(Date.now() / 1000)) * 1000
    ).toISOString();

    const supabase = createClient();

    // --- Profile ---
    let profile: any = null;
    try {
      const { data, error } = await supabase
        .from("jarvis_profile")
        .select("*")
        .eq("user_id", "single-user")
        .single();

      if (error) {
        console.error("Error loading jarvis_profile:", error.message);
      } else {
        profile = data;
      }
    } catch (err) {
      console.error("Exception loading jarvis_profile:", err);
    }

    // --- Finance ---
    const finance = await loadFinance(supabase);

    const timezone: string = profile?.timezone || "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

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

    // --- 0) Time questions ---
    if (isTimeQuestion(userText)) {
      const replyRaw = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;
      const reply = stripSentAtPrefix(replyRaw);

      await sendTelegramText(chatId, reply);
      const audio = await synthesizeTTS(reply);
      if (audio) await sendTelegramVoice(chatId, audio);

      return NextResponse.json({ ok: true });
    }

    // --- 0.5) Percent-of-target questions: Node math only ---
    if (isPercentOfTargetQuestion(userText)) {
      const reply = buildPercentOfTargetAnswerFromText(userText);
      if (reply) {
        await sendTelegramText(chatId, reply);
        const audio = await synthesizeTTS(reply);
        if (audio) await sendTelegramVoice(chatId, audio);
        return NextResponse.json({ ok: true });
      }
    }

    // --- 1) Build system prompt for LLM path ---
    const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE user, talking over Telegram.

USER ID: "single-user"

User identity:
- Name: ${displayName}
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

CONVERSATION & LISTENING (TELEGRAM):

1) If the user replies with a short negation like "no", "nope", "that's not what I meant":
   - Do NOT lecture.
   - Ask a brief clarifying question to understand what they actually want.

2) For math questions that the server hasn't already answered:
   - Listen to the numbers carefully, restate them briefly, then answer.
   - If the user says you're wrong, apologize briefly, restate their numbers, and recompute carefully.
   - Keep coaching short and specific.

3) Coaching style:
   - Be firm about discipline over random trades, especially with high strictness.
   - Use the finance snapshot to show when calm returns are enough to meet his monthly needs.
   - Only say "you lost discipline" when he clearly breaks his own rules, not when he's just asking questions or correcting you.
`.trim();

    const userMessageForModel = `[sent_at: ${sentAtIso}] ${userText}`;

    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageForModel },
      ],
      stream: false,
    });

    const rawReply =
      completion.choices?.[0]?.message?.content || "Got it, Bro.";

    const replyText = stripSentAtPrefix(rawReply);

    await sendTelegramText(chatId, replyText);

    const audio = await synthesizeTTS(replyText);
    if (audio) await sendTelegramVoice(chatId, audio);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TELEGRAM WEBHOOK ERROR:", err);
    return NextResponse.json({ ok: true });
  }
}
