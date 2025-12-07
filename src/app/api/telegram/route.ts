// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { groqClient } from "@/lib/groq";
import { getNowInfo } from "@/lib/time";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    date?: number;
  };
};

async function sendTelegramMessage(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return;
  }

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;

    if (!message || !message.text) {
      return NextResponse.json({ ok: true }); // ignore non-text
    }

    const chatId = message.chat.id;
    const userText = message.text;
    const sentAtIso = new Date((message.date ?? Date.now()) * 1000).toISOString();

    // 1) Time info (same as web)
    const timezone = "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    // 2) System prompt: time-aware but don't leak metadata
    const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE user, talking over Telegram.

You are TIME-AWARE:

- Current time (FOR INTERNAL REASONING ONLY, DO NOT SAY THIS UNLESS ASKED):
  - ISO: ${nowInfo.iso}
  - Local: ${nowInfo.localeString}
  - Timezone: ${nowInfo.timezone}

The user message may start with a tag like:
  [sent_at: 2025-12-07T08:22:54.281Z]

This tag is METADATA ONLY:
- Use it to estimate how much time passed between events.
- NEVER repeat this tag or show it back to the user.
- NEVER quote the full timestamp unless the user explicitly asks.

Behavior:
- Only mention the current time/date if the user asks things like
  "what's the time", "what time is it", "what day is it", or
  "how long has it been".
- Otherwise, use time implicitly ("it's late for you", "you've been away from
  the market for a bit") without dumping exact clocks.
- Keep responses short and Telegram-friendly: no huge essays unless the user asks.
`.trim();

    // 3) User message with hidden timestamp metadata
    const userMessageForModel = `[sent_at: ${sentAtIso}] ${userText}`;

    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageForModel },
      ],
      stream: false,
    });

    const reply = completion.choices?.[0]?.message?.content || "Got it, bro.";

    // 4) Send back to Telegram
    await sendTelegramMessage(chatId, reply);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TELEGRAM API ERROR:", err);
    // We can't show this to the user easily, but keep Telegram webhook happy
    return NextResponse.json({ ok: true });
  }
}
