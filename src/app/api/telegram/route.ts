// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/telegram";

/**
 * Minimal webhook for Telegram.
 * - Receives webhook updates from Telegram (POST JSON).
 * - Extracts simple text messages and echoes a confirmation message back to the same chat.
 *
 * NOTE: For production you will likely:
 *  - verify update types
 *  - forward messages to your chat engine / supabase / job queue
 *  - avoid echoing and instead respond with an LLM-generated reply
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });

    // Telegram update structure: { update_id, message, edited_message, ... }
    const update = body;
    const message = update.message ?? update.edited_message ?? update.channel_post ?? null;

    if (!message) {
      // unsupported update (e.g., callback_query) — acknowledge
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat?.id;
    const text = message.text ?? (message.caption ?? "");
    const fromUser = message.from?.username ?? `${message.from?.first_name ?? ""} ${message.from?.last_name ?? ""}`;

    // Basic: log to server console (visible in Vercel logs)
    console.log("[telegram webhook] chat:", chatId, "from:", fromUser, "text:", text);

    // TODO: Replace the next lines with your "forward to Jarvis" process (supabase insert or call to chat endpoint)
    // For now, just echo an acknowledgement.
    const replyText = `Received your message${fromUser ? `, ${fromUser}` : ""}:\n${text || "<non-text message>"}`;

    // Send reply (async). We won't wait long — but we'll await to catch errors.
    const tgResp = await sendMessage(chatId, replyText, { parse_mode: "Markdown" });

    // Return a 200 to Telegram quickly.
    return NextResponse.json({ ok: true, tgResp });
  } catch (err: any) {
    console.error("[telegram route] error:", err?.message ?? err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
