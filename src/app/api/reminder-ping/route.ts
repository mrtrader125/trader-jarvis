// src/app/api/reminder-ping/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Simple Telegram send util (text only) */
async function sendTelegramText(chatId: number | string, text: string) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN in reminder-ping");
    return { ok: false, error: "Missing token" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const json = await res.json();
    return { ok: res.ok, result: json };
  } catch (err) {
    console.error("Telegram send error:", err);
    return { ok: false, error: String(err) };
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // find due reminders (scheduled and send_at <= now)
    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabase
      .from("jarvis_reminders")
      .select("*")
      .lte("send_at", nowIso)
      .in("status", ["scheduled", "pending"])
      .limit(100);

    if (error) {
      console.error("Failed to fetch reminders:", error);
      return NextResponse.json({ ok: false, error });
    }

    for (const r of due || []) {
      const chatId = r.chat_id ?? r.user_id === "single-user" ? process.env.TELEGRAM_CHAT_ID : null;
      // fallback: try to read telegram_chat_id from profile
      let targetChatId = chatId;
      if (!targetChatId) {
        const { data: profile } = await supabase
          .from("jarvis_profile")
          .select("telegram_chat_id")
          .eq("user_id", "single-user")
          .single();
        targetChatId = profile?.telegram_chat_id ?? process.env.TELEGRAM_CHAT_ID;
      }
      if (!targetChatId) {
        console.error("No chat id for reminder", r);
        continue;
      }

      // send
      const text = r.message;
      const sendRes = await sendTelegramText(targetChatId, text);

      // update row status
      await supabase
        .from("jarvis_reminders")
        .update({
          status: sendRes.ok ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", r.id);
    }

    return NextResponse.json({ ok: true, sent: due?.length ?? 0 });
  } catch (err) {
    console.error("Reminder ping error:", err);
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
