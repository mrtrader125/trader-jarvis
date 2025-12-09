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

const MEMORY_SUMMARY_TRIGGER = Number(process.env.MEMORY_SUMMARY_TRIGGER || 120);
const JOBS_SUMMARY_ENDPOINT = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/jobs/summarize`
  : process.env.JOBS_SUMMARY_ENDPOINT || `http://localhost:3000/api/jobs/summarize`;

function triggerBackgroundSummarizer(payload?: any) {
  fetch(JOBS_SUMMARY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  }).then((r) => {
    if (!r.ok) console.warn("background summarizer returned not ok", r.status);
  }).catch((err) => {
    console.warn("background summarizer trigger failed", err);
  });
}

// Telegram helpers for getting file URL and downloading file bytes
async function getTelegramFileUrl(botToken: string, fileId: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  const j = await res.json();
  if (!j.ok) throw new Error("getFile failed");
  const path = j.result.file_path;
  return `https://api.telegram.org/file/bot${botToken}/${path}`;
}
async function fetchFileBytes(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to download file");
  const buf = await r.arrayBuffer();
  return Buffer.from(buf);
}

// Deepgram transcription
async function transcribeWithDeepgram(audioBuffer: Buffer, mime = "audio/ogg") {
  const DG_KEY = process.env.DEEPGRAM_API_KEY;
  if (!DG_KEY) throw new Error("Missing DEEPGRAM_API_KEY");

  const url = "https://api.deepgram.com/v1/listen?punctuate=true&language=en";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${DG_KEY}`,
      "Content-Type": mime,
    },
    body: audioBuffer,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Deepgram failed: ${resp.status} ${txt}`);
  }
  const j = await resp.json();
  // typical Deepgram path: results.channels[0].alternatives[0].transcript
  const transcript = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  return transcript;
}

// Minimal send helper (replace with your existing helper if present)
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

    // If voice: download and transcribe via Deepgram
    if (!text && message.voice) {
      try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const fileId = message.voice.file_id;
        const fileUrl = await getTelegramFileUrl(botToken, fileId);
        const fileBytes = await fetchFileBytes(fileUrl);
        // Deepgram supports many formats; Telegram voice is often OGG/OPUS
        const transcript = await transcribeWithDeepgram(fileBytes, "audio/ogg");
        text = transcript || "";
      } catch (dgErr) {
        console.error("Deepgram transcription error", dgErr);
        await sendTelegramMessage(chatId, "Sorry, I couldn't transcribe your voice message. Try sending text.");
        return NextResponse.json({ ok: true });
      }
    }

    if (!text) {
      await sendTelegramMessage(chatId, "I received a non-text message. Please send text or a voice note.");
      return NextResponse.json({ ok: true });
    }

    // 1) LLM-based memory extraction
    let extracted = null;
    try { extracted = await extractMemoryWithLLM(text, userId); } catch (e) { extracted = null; }
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

    // trigger background summarizer if needed (single-user run)
    if ((memorySummary?.count || 0) > MEMORY_SUMMARY_TRIGGER) {
      triggerBackgroundSummarizer({ users: [userId] });
    }

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
