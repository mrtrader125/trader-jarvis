// src/app/api/reminder-ping/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sendTelegramText(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN in reminder-ping");
    return;
  }

  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );
}

export async function GET() {
  try {
    const supabase = createClient();
    const nowIso = new Date().toISOString();

    // Get all due, undelivered reminders (limit so we don't spam).
    const { data, error } = await supabase
      .from("jarvis_reminders")
      .select("*")
      .is("delivered_at", null)
      .lte("due_at", nowIso)
      .order("due_at", { ascending: true })
      .limit(30);

    if (error) {
      console.error("Error loading reminders:", error.message);
      return NextResponse.json({ ok: false });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    for (const rem of data) {
      const chatId: string | null =
        rem.chat_id ||
        process.env.TELEGRAM_PRIMARY_CHAT_ID ||
        null;

      if (!chatId) {
        console.error(
          "Reminder has no chat_id and TELEGRAM_PRIMARY_CHAT_ID is missing. Skipping.",
          rem.id
        );
        continue;
      }

      const text = `Bro, reminder: ${rem.body}`;

      try {
        await sendTelegramText(chatId, text);
      } catch (e) {
        console.error("Failed to send reminder to Telegram:", e);
        continue;
      }

      // Mark as delivered
      await supabase
        .from("jarvis_reminders")
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", rem.id);
    }

    return NextResponse.json({ ok: true, sent: data.length });
  } catch (e) {
    console.error("REMINDER-PING ERROR:", e);
    return NextResponse.json({ ok: false });
  }
}
