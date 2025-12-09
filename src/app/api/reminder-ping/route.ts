// src/app/api/reminder-ping/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simple Telegram text send helper using fetch.
 */
async function sendTelegramText(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN in reminder-ping");
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
  } catch (err) {
    console.error("Failed to call Telegram API:", err);
    throw err;
  }
}

/**
 * GET handler — intended to be called by a cron job every minute (or every few minutes).
 * It finds due reminders (undelivered) and sends them.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const nowIso = new Date().toISOString();

    // Query due, undelivered reminders (adjust table/column names to match your DB)
    const { data, error } = await supabase
      .from("jarvis_reminders")
      .select("*")
      .is("delivered_at", null)
      .lte("due_at", nowIso)
      .order("due_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("Error loading reminders:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    let sentCount = 0;

    for (const rem of data) {
      try {
        // Determine chat id
        const chatId: string | null =
          rem.chat_id ||
          process.env.TELEGRAM_PRIMARY_CHAT_ID ||
          null;

        if (!chatId) {
          console.error("Reminder has no chat_id and TELEGRAM_PRIMARY_CHAT_ID is missing. Skipping.", rem);
          // Optionally mark as failed to avoid infinite retries:
          await supabase
            .from("jarvis_reminders")
            .update({ last_error: "missing chat_id", retry_count: (rem.retry_count || 0) + 1 })
            .eq("id", rem.id);
          continue;
        }

        const text = `Bro, reminder: ${rem.body ?? rem.message ?? "⏰"}`;

        // Only Telegram is supported here for now
        if ((rem.channel ?? "telegram") === "telegram") {
          await sendTelegramText(chatId, text);
        } else {
          // If you later add web push, email, etc. handle here.
          console.log("Would send non-telegram reminder:", rem);
        }

        // Mark delivered
        const { error: updateErr } = await supabase
          .from("jarvis_reminders")
          .update({ delivered_at: new Date().toISOString() })
          .eq("id", rem.id);

        if (updateErr) {
          console.error("Failed to mark reminder delivered:", updateErr.message);
        } else {
          sentCount++;
        }
      } catch (innerErr) {
        console.error("Failed to send reminder", rem.id, innerErr);
        // update retry_count and last_error
        await supabase
          .from("jarvis_reminders")
          .update({
            last_error: String(innerErr),
            retry_count: (rem.retry_count || 0) + 1,
          })
          .eq("id", rem.id);
      }
    }

    return NextResponse.json({ ok: true, sent: sentCount });
  } catch (e) {
    console.error("REMINDER-PING ERROR:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
