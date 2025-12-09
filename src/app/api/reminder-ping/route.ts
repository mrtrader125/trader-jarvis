// src/app/api/reminder-ping/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Send a text message to Telegram (simple util).
 * Returns { ok: boolean, result?: any, error?: string }
 */
async function sendTelegramText(chatId: number | string, text: string) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN in reminder-ping");
    return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const json = await res.json();
    return { ok: res.ok, result: json };
  } catch (err: any) {
    console.error("Telegram send error:", err);
    return { ok: false, error: String(err) };
  }
}

/**
 * GET: process due reminders from Supabase and send them.
 * Intended to be called from a scheduler (cron) or manually via GET.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabase
      .from("jarvis_reminders")
      .select("*")
      .lte("send_at", nowIso)
      .in("status", ["scheduled", "pending"])
      .limit(100);

    if (error) {
      console.error("Failed to fetch reminders:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }

    let sentCount = 0;
    for (const r of due || []) {
      // Determine target chat id (hierarchy: row.chat_id -> profile.telegram_chat_id -> env TELEGRAM_CHAT_ID)
      let targetChatId = r.chat_id ?? null;

      if (!targetChatId) {
        const { data: profile, error: pErr } = await supabase
          .from("jarvis_profile")
          .select("telegram_chat_id")
          .eq("user_id", r.user_id ?? "single-user")
          .single();

        if (pErr) {
          // not fatal; we'll fallback to env below
          console.warn("profile lookup error for reminder", r.id, pErr);
        } else {
          targetChatId = profile?.telegram_chat_id ?? null;
        }
      }

      if (!targetChatId && process.env.TELEGRAM_CHAT_ID) {
        targetChatId = process.env.TELEGRAM_CHAT_ID;
      }

      if (!targetChatId) {
        console.error("No chat id for reminder", r.id);
        // mark failed so it won't loop infinitely
        await supabase.from("jarvis_reminders").update({
          status: "failed",
          sent_at: new Date().toISOString(),
        }).eq("id", r.id);
        continue;
      }

      const text = r.message ?? "Reminder from Jarvis";
      const sendRes = await sendTelegramText(targetChatId, text);

      await supabase
        .from("jarvis_reminders")
        .update({
          status: sendRes.ok ? "sent" : "failed",
          sent_at: new Date().toISOString(),
          metadata: sendRes.result ?? null,
        })
        .eq("id", r.id);

      if (sendRes.ok) sentCount++;
    }

    return NextResponse.json({ ok: true, sent: sentCount });
  } catch (err: any) {
    console.error("Reminder ping error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

/**
 * POST: handle immediate actions like "send_telegram"
 * Body expected:
 * { action: "send_telegram", chat_id?: number|string, text: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
    }

    const action = body.action;
    if (action === "send_telegram") {
      const chatId = body.chat_id ?? process.env.TELEGRAM_CHAT_ID;
      const text = body.text || "Reminder from Jarvis";

      if (!chatId) {
        return NextResponse.json({ ok: false, error: "no-chat-id" }, { status: 400 });
      }

      const sendRes = await sendTelegramText(chatId, text);
      return NextResponse.json({ ok: sendRes.ok, result: sendRes.result ?? null, error: sendRes.error ?? null });
    }

    return NextResponse.json({ ok: false, error: "unknown-action" }, { status: 400 });
  } catch (err: any) {
    console.error("reminder-ping POST error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
