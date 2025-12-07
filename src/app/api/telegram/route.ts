// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { groqClient } from "@/lib/groq";
import { getNowInfo } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";

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
  if (!TELEGRAM_BOT_TOKEN) return;

  const form = new FormData();
  form.append("chat_id", String(chatId));

  const blob = new Blob([audio], { type: "audio/ogg" });
  form.append("voice", blob as any, "jarvis.ogg");

  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
    {
      method: "POST",
      body: form as any,
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

    // ---- 1) Load Jarvis profile (single-user) ----
    const supabase = createClient();
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

    // 🔐 2) Direct time questions → backend answer
    if (isTimeQuestion(userText)) {
      const reply = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;

      await sendTelegramText(chatId, reply);
      const audio = await synthesizeTTS(reply);
      if (audio) await sendTelegramVoice(chatId, audio);

      return NextResponse.json({ ok: true });
    }

    // ---- 3) Build system prompt with routine + sliders ----
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
- This tag is METADATA ONLY.
- Use it to estimate how long it's been since the last message.
- NEVER repeat the [sent_at: ...] tag or show raw ISO timestamps.

BEHAVIOR:
- Keep replies short (1–3 sentences) unless the user asks for detail.
- Use routine intelligently:
  - If it's very late for them, nudge them toward rest.
  - During trading hours, focus on prep, execution, and discipline.
  - If they are trading outside the normal session, warn about impulse decisions.
- Adjust tone by sliders:
  - More strictness → more firm about rules.
  - More empathy → more emotional validation.
  - More humor → light but still focused, no clowning around.
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

    const replyText =
      completion.choices?.[0]?.message?.content || "Got it, bro.";

    await sendTelegramText(chatId, replyText);

    const audio = await synthesizeTTS(replyText);
    if (audio) await sendTelegramVoice(chatId, audio);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TELEGRAM WEBHOOK ERROR:", err);
    return NextResponse.json({ ok: true });
  }
}
