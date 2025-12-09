// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNowInfo } from "@/lib/time";
import {
  fetchRelevantMemories,
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

/**
 * fire-and-forget helper to trigger background job endpoint.
 */
function triggerBackgroundSummarizer(payload?: any) {
  // best-effort: do not await; log errors
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId || body.user?.id || "anon";
    const timezone = body.timezone || "Asia/Kolkata";
    const message = (body.message || body.text || "").toString();
    if (!message) return NextResponse.json({ error: "No message provided" }, { status: 400 });

    // 1) extract memory with LLM extractor
    let extracted = null;
    try { extracted = await extractMemoryWithLLM(message, userId); } catch (e) { extracted = null; }

    if (extracted && extracted.shouldSave) {
      await saveMemoryItem({
        user_id: userId,
        type: extracted.type,
        text: extracted.text || message,
        tags: extracted.tags,
        importance: extracted.importance,
        timezone,
        source: "user_message_llm_extractor",
      });
    }

    // 2) time & market
    const now = getNowInfo(timezone);
    const nse = getMarketStatus("NSE", timezone);
    const nyse = getMarketStatus("NYSE", timezone);

    // 3) fetch light memory summary for prompt
    const memorySummary = await summarizeMemory(userId, 30 * 24);

    // 4) if memory count large, trigger background summarizer (fire-and-forget)
    if ((memorySummary?.count || 0) > MEMORY_SUMMARY_TRIGGER) {
      // optionally include single-user run to speed up
      triggerBackgroundSummarizer({ users: [userId] });
    }

    // 5) repetition prevention for smalltalk
    const lower = message.toLowerCase();
    if (/(how are you|how's your day|how is your day|how are you doing)/i.test(lower)) {
      const repeatCheck = await shouldAskQuestion(userId, "how_are_you", 24);
      if (!repeatCheck.shouldAsk) {
        const replyText = `You previously said: "${repeatCheck.lastAnswer}". Do you want to update that or talk about something else?`;
        return NextResponse.json({ reply: replyText, skippedLLM: true });
      }
    }

    // 6) build prompt + market info
    const systemPrompt = buildSystemPrompt({
      now,
      memorySummary,
      lastAnswersForQuestions: {},
    }) + `
Market quick-check:
- NSE: ${nse.market?.name ?? "unknown"} — open: ${nse.open ? "YES" : "NO"} (market local: ${nse.marketTimeHuman}, user time: ${nse.userTimeHuman})
- NYSE: ${nyse.market?.name ?? "unknown"} — open: ${nyse.open ? "YES" : "NO"} (market local: ${nyse.marketTimeHuman}, user time: ${nyse.userTimeHuman})

Instruction: Use the above market status for any market-timing statements. If you are unsure, say "I don't have live market hours for that exchange" rather than guessing.
`;

    // 7) build messages and call LLM
    const messages = body.history && Array.isArray(body.history) && body.history.length > 0
      ? body.history.map((m: any) => ({ role: m.role, content: m.content }))
      : [{ role: "user", content: message }];

    const assistantText = await callLLM(systemPrompt, messages);

    // 8) save assistant reply
    await saveMemoryItem({
      user_id: userId,
      type: "assistant_reply",
      text: assistantText,
      tags: ["assistant_reply"],
      importance: 1,
      timezone,
      source: "assistant",
    });

    return NextResponse.json({ reply: assistantText });
  } catch (err: any) {
    console.error("chat route error", err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
