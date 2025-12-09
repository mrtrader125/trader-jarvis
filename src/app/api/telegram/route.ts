// src/app/api/telegram/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNowInfo } from "@/lib/time";
import { handleIncomingChat } from "@/lib/chat-forward";
import { sendToTelegram } from "@/lib/telegram";
import memoryLib from "@/lib/jarvis-memory";

type TelegramWebhook = any; // keep flexible for various shapes

export async function POST(req: NextRequest) {
  try {
    const body: TelegramWebhook = await req.json();

    // Telegram webhook shapes: body.message, body.edited_message, body.channel_post
    const message = body?.message ?? body?.edited_message ?? body?.channel_post;
    if (!message) {
      // nothing to do; return 200 so Telegram doesn't retry aggressively
      return NextResponse.json({ ok: true, reason: "no message payload" });
    }

    const chatId = message.chat?.id;
    const text = message.text ?? message.caption ?? "";
    const from = message.from ?? {};
    const updateId = body.update_id ?? null;

    if (!chatId || !text) {
      console.warn("telegram webhook missing chatId or text", { body });
      return NextResponse.json({ ok: true, reason: "missing chatId or text" });
    }

    // Build userId mapping for Jarvis
    const userId = `tg:${chatId}`;

    // Build messages for chat-forward
    const incomingMessages = [{ role: "user", content: text }];

    // Forward to internal chat handler (chat-sync style) and get plain text response
    let finalText = "Hi — Jarvis received your message.";
    try {
      const reply = await handleIncomingChat({ messages: incomingMessages, userId });
      // handleIncomingChat returns text (or SSE blob); attempt to normalize
      if (typeof reply === "string") {
        finalText = reply;
      } else if (reply && (reply as any).text) {
        finalText = (reply as any).text;
      } else {
        finalText = String(reply ?? finalText);
      }
    } catch (e) {
      console.warn("handleIncomingChat failed:", e);
      finalText = "Jarvis encountered an error processing your message. Try again.";
    }

    // Send reply back to Telegram
    try {
      await sendToTelegram(chatId, finalText);
    } catch (e) {
      console.warn("sendToTelegram failed:", e);
    }

    // Persist exchange to Supabase (best-effort)
    try {
      const supabase = createClient();
      const now = getNowInfo();
      await supabase.from("telegram_messages").insert([
        {
          user_id: userId,
          message: text,
          reply: finalText,
          update_id: updateId,
          ts: now.iso,
        },
      ]);

      // Also save a conversation snapshot and write journal (best-effort)
      try {
        const convo = [{ role: "user", content: text, ts: now.iso }, { role: "assistant", content: finalText, ts: new Date().toISOString() }];
        if (memoryLib && typeof memoryLib.saveConversation === "function") {
          await memoryLib.saveConversation({ userId, messages: convo, summary: `${String(text).slice(0, 400)}\n\nJARVIS: ${(finalText ?? "").slice(0, 800)}` });
        }
        if (memoryLib && typeof memoryLib.writeJournal === "function") {
          await memoryLib.writeJournal(userId, { event: "telegram_processed", update_id: updateId, provenance: [] }, "telegram");
        }
      } catch (e) {
        console.warn("conversation/journal persist failed:", e);
      }
    } catch (e) {
      console.warn("persist telegram message failed:", e);
    }

    // Return success to Telegram quickly
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("/api/telegram POST error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
