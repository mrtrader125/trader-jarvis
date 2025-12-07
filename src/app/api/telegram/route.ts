// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { groqClient } from "@/lib/groq";
import { getNowInfo } from "@/lib/time";

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
  // @ts-expect-error Node FormData typing is loose; this works at runtime
  form.append("voice", blob, "jarvis.ogg");

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

    const timezone = "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    // 🔐 HARD RULE: time questions get direct backend answer
    if (isTimeQuestion(userText)) {
      const reply = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;

      await sendTelegramText(chatId, reply);
      const audio = await synthesizeTTS(reply);
      if (audio) {
        await sendTelegramVoice(chatId, audio);
      }

      return NextResponse.json({ ok: true });
    }

    // Otherwise: use Groq + time metadata, but keep answers concise
    const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE user, talking over Telegram.

You are TIME-AWARE:

- Current time (FOR INTERNAL REASONING ONLY, DO NOT SAY THIS UNLESS THE USER ASKS ABOUT TIME):
  - ISO: ${nowInfo.iso}
  - Local: ${nowInfo.localeString}
  - Timezone: ${nowInfo.timezone}

User text may be wrapped like:
  [sent_at: 2025-12-07T08:22:54.281Z] actual text...

This [sent_at: ...] tag is METADATA ONLY:
- Use it to estimate how long it's been.
- NEVER repeat the tag or show it to the user.
- NEVER print the raw ISO timestamp.

Behavior:
- Keep replies short (1–3 sentences) unless the user asks for detail.
- Use time implicitly (e.g., "it's late for you") without dumping exact clocks.
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
      completion.choices?.[0]?.message?.content ||
      "Got it, bro.";

    // Send text
    await sendTelegramText(chatId, replyText);

    // Send voice (best effort)
    const audio = await synthesizeTTS(replyText);
    if (audio) {
      await sendTelegramVoice(chatId, audio);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TELEGRAM WEBHOOK ERROR:", err);
    return NextResponse.json({ ok: true });
  }
}
