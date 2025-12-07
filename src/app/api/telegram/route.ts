// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { groqClient } from "@/lib/groq";
import { getNowInfo } from "@/lib/time";

export const runtime = "nodejs"; // we need Node features (Buffer, FormData, etc.)

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

async function sendTelegramVoice(chatId: number, audioBuffer: Buffer) {
  if (!TELEGRAM_BOT_TOKEN) return;

  const form = new FormData();
  form.append("chat_id", String(chatId));

  // Telegram accepts raw binary here; cast to any to satisfy TS in Node runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.append("voice", audioBuffer as any, "jarvis.ogg");

  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
    {
      method: "POST",
      body: form as any,
    }
  );
}


async function synthesizeTTS(text: string): Promise<Buffer | null> {
  if (!DEEPGRAM_API_KEY) {
    console.error("Missing DEEPGRAM_API_KEY");
    return null;
  }

  // You can change model or options here based on what you used before
  const res = await fetch(
    "https://api.deepgram.com/v1/speak?model=aura-asteria-en",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!res.ok) {
    console.error("Deepgram TTS error:", await res.text());
    return null;
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;

    if (!message || !message.text) {
      return NextResponse.json({ ok: true }); // ignore non-text updates
    }

    const chatId = message.chat.id;
    const userText = message.text;
    const sentAtIso = new Date(
      (message.date ?? Math.floor(Date.now() / 1000)) * 1000
    ).toISOString();

    // ---- Time awareness (same as web) ----
    const timezone = "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE user, talking over Telegram.

You are TIME-AWARE:

- Current time (FOR INTERNAL REASONING ONLY, DO NOT SAY THIS UNLESS ASKED):
  - ISO: ${nowInfo.iso}
  - Local: ${nowInfo.localeString}
  - Timezone: ${nowInfo.timezone}

The user message may be wrapped like:
  [sent_at: 2025-12-07T08:22:54.281Z] actual text...

This tag is METADATA ONLY:
- Use it to estimate how much time passed between events.
- NEVER repeat the [sent_at: ...] tag or show it back to the user.
- NEVER quote the full timestamp unless the user explicitly asks.

Behavior:
- Only mention the current time/date if the user asks
  ("what's the time", "current time", etc.).
- Otherwise, use time implicitly ("it's late for you", "you've been away a while")
  without dumping exact clocks.
- Keep replies fairly concise for Telegram.
`.trim();

    // User message with hidden timestamp meta
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
      "Got it, bro. (No reply content from model).";

    // 1) Send TEXT reply
    await sendTelegramText(chatId, replyText);

    // 2) Synthesize and send VOICE reply (best-effort)
    const audioBuffer = await synthesizeTTS(replyText);
    if (audioBuffer) {
      await sendTelegramVoice(chatId, audioBuffer);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TELEGRAM WEBHOOK ERROR:", err);
    return NextResponse.json({ ok: true });
  }
}
