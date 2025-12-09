// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import fetch from "node-fetch";
import { getNowInfo } from "@/lib/time";
import {
  extractMemoryFromMessage,
  saveMemoryItem,
  shouldAskQuestion,
  summarizeMemory,
} from "@/lib/jarvis-memory";
import { buildSystemPrompt } from "@/lib/jarvis/systemPrompt";
import { getMarketStatus } from "@/lib/markets";

// reuse callLLM from chat route by requiring the file if you keep it module-scoped.
// To keep this file standalone, reimplement callLLM here similarly or import from a shared utils file.
let shared: any = null;
try { shared = require("./route_shared"); } catch (e) { /* optional */ }

// minimal send helper (use your existing wrapper if you have one)
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

// We'll try to reuse callLLM from route_shared (if you created it) or from chat route module.
// Best practice: extract callLLM into a shared helper and import it in both routes.
let callLLM: any = null;
try {
  const chatModule = require("./route"); // if same dir and exported; adapt path if needed
  callLLM = chatModule.callLLM ?? null;
} catch (e) {
  callLLM = null;
}

if (!callLLM) {
  // fallback: try to import a shared helper or throw a friendly message.
  callLLM = async () => {
    throw new Error("callLLM not available in telegram route. Please import the Groq adapter or create a shared callLLM util.");
  };
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

    // If voice/audio: you should download the file via Telegram File API and transcribe it
    // Then set text = transcript. That logic is not included here; integrate your transcription flow.
    if (!text) {
      // optionally handle voice here
      await sendTelegramMessage(chatId, "I received a non-text message. Voice transcripts are not yet enabled in this webhook.");
      return NextResponse.json({ ok: true });
    }

    // 1) extract & save memory if relevant
    const extracted = extractMemoryFromMessage(text);
    if (extracted) {
      await saveMemoryItem({
        user_id: userId,
        type: extracted.type,
        text: extracted.text,
        tags: extracted.tags,
        importance: extracted.importance,
        timezone,
        source: "telegram_message",
      });
    }

    // 2) repetition prevention for smalltalk
    if (/(how are you|how's your day|how is your day|how are you doing)/i.test(text.toLowerCase())) {
      const repeatCheck = await shouldAskQuestion(userId, "how_are_you", 24);
      if (!repeatCheck.shouldAsk) {
        const reply = `Earlier you said: "${repeatCheck.lastAnswer}". Do you want to update that or talk about something else?`;
        await sendTelegramMessage(chatId, reply);
        return NextResponse.json({ ok: true });
      }
    }

    // 3) build prompt with memory + time + market info
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

    // 5) save assistant answer and reply back to user
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
