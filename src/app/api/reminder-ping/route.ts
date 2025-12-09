// src/app/api/reminder-ping/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramText(chatId: number | string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN in reminder-ping");
    return;
  }

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Expected shape:
    // { action: "send_telegram", chat_id: <number|string>, text: "..." }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
    }

    const action = body.action;
    if (action === "send_telegram") {
      const chatId = body.chat_id;
      const text = body.text || "Reminder from Jarvis";

      await sendTelegramText(chatId, text);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "unknown-action" }, { status: 400 });
  } catch (err: any) {
    console.error("reminder-ping error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
