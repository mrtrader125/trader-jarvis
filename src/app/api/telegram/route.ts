// src/app/api/telegram/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNowInfo } from "@/lib/time";
import { handleIncomingChat } from "@/lib/chat-forward";
import { sendToTelegram } from "@/lib/telegram";
import memoryLib from "@/lib/jarvis-memory";

type TelegramWebhook = any; // keep flexible

export async function POST(req: NextRequest) {
  try {
    const body: TelegramWebhook = await req.json();

    const message =
      body?.message ?? body?.edited_message ?? body?.channel_post;

    if (!message) {
      return NextResponse.json({
        ok: true,
        reason: "no message payload",
      });
    }

    const chatId = message.chat?.id;
    const text = message.text ?? message.caption ?? "";
    const updateId = body.update_id ?? null;

    if (!chatId || !text) {
      console.warn("telegram webhook missing chatId or text", { body });
      return NextResponse.json({
        ok: true,
        reason: "missing chatId or text",
      });
    }

    // map telegram user to jarvis user
    const userId = `tg:${chatId}`;
    const incoming = [{ role: "user", content: text }];

    // === 1) Forward to Jarvis internal chat ===
    let finalText = "Hi — Jarvis received your message.";
    try {
      const reply = await handleIncomingChat({
        messages: incoming,
        userId,
      });

      // Safe normalization: check shapes before accessing .text
      if (typeof reply === "string") {
        finalText = reply;
      } else if (reply && typeof reply === "object") {
        // If it has a 'text' property that's a string, use it.
        if ("text" in reply && typeof (reply as any).text === "string") {
          finalText = (reply as any).text;
        } else if ("reply" in reply && typeof (reply as any).reply === "string") {
          finalText = (reply as any).reply;
        } else if ("message" in reply && typeof (reply as any).message === "string") {
          finalText = (reply as any).message;
        } else {
          // fallback to stringifying the object (safe)
          finalText = JSON.stringify(reply);
        }
      } else {
        finalText = String(reply ?? finalText);
      }
    } catch (err) {
      console.warn("handleIncomingChat failed:", err);
      finalText =
        "Jarvis encountered an error processing your message. Try again.";
    }

    // === 2) Send Telegram reply ===
    try {
      await sendToTelegram(chatId, finalText);
    } catch (e) {
      console.warn("sendToTelegram failed:", e);
    }

    // === 3) Persist to Supabase ===
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

      // Build conversation (TS-safe by using any[])
      const convo: any[] = [
        { role: "user", content: text, ts: now.iso },
        {
          role: "assistant",
          content: finalText,
          ts: new Date().toISOString(),
        },
      ];

      // Save conversation
      if (typeof (memoryLib as any).saveConversation === "function") {
        await (memoryLib as any).saveConversation({
          userId,
          messages: convo,
          summary: `${String(text).slice(0, 400)}\n\nJARVIS: ${(
            finalText ?? ""
          ).slice(0, 800)}`,
        } as any);
      }

      // Save journal event
      if (typeof (memoryLib as any).writeJournal === "function") {
        await (memoryLib as any).writeJournal(
          userId,
          {
            event: "telegram_processed",
            update_id: updateId,
            provenance: [],
          },
          "telegram"
        );
      }
    } catch (err) {
      console.warn("persist telegram conversation/journal failed:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("/api/telegram POST error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}