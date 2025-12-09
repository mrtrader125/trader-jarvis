// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import fetch from "node-fetch";
import { getNowInfo } from "@/lib/time";
import {
  saveMemoryItem,
  shouldAskQuestion,
  summarizeMemory,
} from "@/lib/jarvis-memory";
import { buildSystemPrompt } from "@/lib/jarvis/systemPrompt";
import { getMarketStatus } from "@/lib/markets";
import callLLM from "@/lib/llm";
import extractMemoryWithLLM from "@/lib/memory-extractor-llm";

// Helper to send simple messages (use your existing helper if you have one)
async function sendTelegramMessage(chatId: string | number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const update = body;
    const message = update.message || update.edited_message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat?.id;
    const userId = message.from?.id || chatId || "tg_anon";
    const timezone = "Asia/Kolkata";
    let text = message.text || message.caption || "";

    if (!text) {
      await sendTelegramMessage(chatId, "I received a non-text message. Please send text or voice (voice not yet supported in this webhook).");
      return NextResponse.json({ ok: true });
    }

    // 1) LLM-based memory extraction
    let extracted = null;
    try { extracted = await extractMemoryWithLLM(text, userId); } catch (e) { console.warn("extractor LLM failed:", e); extracted = null; }
    if (extracted && extracted.shouldSave) {
      await saveMemoryItem({
        user_id: userId,
        type: extracted.type,
        text: extracted.text || text,
        tags: extracted.tags,
        importance: extracted.importance,
        timezone,
        source: "telegram_user_llm",
      });
    }

    // 2) repetition prevention for smalltalk
    if (/(how are you|how's your day|how are you doing)/i.test(text.toLowerCase())) {
      const repeatCheck = await shouldAskQuestion(userId, "how_are_you", 24);
      if (!repeatCheck.shouldAsk) {
        const reply = `Earlier you said: "${repeatCheck.lastAnswer}". Do you want to update that or talk about something else?`;
        await sendTelegramMessage(chatId, reply);
        return NextResponse.json({ ok: true });
      }
    }

    // 3) build prompt + memory summary + market info
    const now = getNowInfo(timezone);
    const memorySummary = await summarizeMemory(userId, 30 * 24);
    const nse = getMarketStatus("NSE", timezone);
    const systemPrompt = buildSystemPrompt({ now, memorySummary }) + `
Market note: NSE open? ${nse.open ? "YES" : "NO"} (market local: ${nse.marketTimeHuman})
Please rely on the above market status for market-timing statements.
`;

    // 4) call LLM
    const messages = [{ role: "user", content: text }];
    const assistantText = await callLLM(systemPrompt, messages);

    // 5) save assistant reply and send to Telegram
    await saveMemoryItem({
      user_id: userId,
      type: "assistant_reply",
      text: assistantText,
      tags: ["assistant_reply"],
      importance: 1,
      timezone,
      source: "assistant",
    });

    await sendTelegramMessage(chatId, assistantText);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("telegram route error", err);
    return NextResponse.json({ ok: false, error: err?.message || "unknown" }, { status: 500 });
  }
}
