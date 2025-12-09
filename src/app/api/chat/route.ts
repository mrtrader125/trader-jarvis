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
import summarizeItemsWithLLM from "@/lib/memory-summarizer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId || body.user?.id || "anon";
    const timezone = body.timezone || "Asia/Kolkata";
    const message = (body.message || body.text || "").toString();
    if (!message) return NextResponse.json({ error: "No message provided" }, { status: 400 });

    // 1) LLM-based extraction (preferred) with fallback to heuristic extractor in jarvis-memory if desired
    let extracted = null;
    try {
      extracted = await extractMemoryWithLLM(message, userId);
    } catch (e) { console.warn("extractor LLM failed, falling back"); extracted = null; }

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

    // 2) Time & market context
    const now = getNowInfo(timezone);
    const nse = getMarketStatus("NSE", timezone);
    const nyse = getMarketStatus("NYSE", timezone);

    // 3) memory summary (prefer LLM summarizer when memory count large)
    const memorySummary = await summarizeMemory(userId, 30 * 24); // existing fast summarizer
    // if memorySummary.count > threshold, run LLM summarizer to produce compact summary and persist
    if ((memorySummary?.count || 0) > 120) {
      // fetch the raw recent items to summarize (use fetchRelevantMemories)
      const recent = await fetchRelevantMemories(userId, null, 30 * 24, 200);
      await summarizeItemsWithLLM({ userId, items: recent, persist: true });
      // re-run light summarizer to get updated summary for prompt
      // (you can also fetch the new summary from DB; simpler to call summarizeMemory again)
      // Note: this is synchronous; consider moving to background job if too heavy.
    }

    const updatedMemorySummary = await summarizeMemory(userId, 30 * 24);

    // 4) repetition prevention for smalltalk
    const lower = message.toLowerCase();
    if (/(how are you|how's your day|how is your day|how are you doing)/i.test(lower)) {
      const repeatCheck = await shouldAskQuestion(userId, "how_are_you", 24);
      if (!repeatCheck.shouldAsk) {
        const replyText = `You previously said: "${repeatCheck.lastAnswer}". Do you want to update that or talk about something else?`;
        return NextResponse.json({ reply: replyText, skippedLLM: true });
      }
    }

    // 5) build system prompt with memory and market info
    const systemPrompt = buildSystemPrompt({
      now,
      memorySummary: updatedMemorySummary,
      lastAnswersForQuestions: {},
    }) + `
Market quick-check:
- NSE: ${nse.market?.name ?? "unknown"} — open: ${nse.open ? "YES" : "NO"} (market local: ${nse.marketTimeHuman}, user time: ${nse.userTimeHuman})
- NYSE: ${nyse.market?.name ?? "unknown"} — open: ${nyse.open ? "YES" : "NO"} (market local: ${nyse.marketTimeHuman}, user time: ${nyse.userTimeHuman})

Instruction: Use the above market status for any market-timing statements. If you are unsure, say "I don't have live market hours for that exchange" rather than guessing.
`;

    // 6) compile messages; include last few messages if your UI sends them in body
    const messages = body.history && Array.isArray(body.history) && body.history.length > 0
      ? body.history.map((m: any) => ({ role: m.role, content: m.content }))
      : [{ role: "user", content: message }];

    // 7) call LLM
    const assistantText = await callLLM(systemPrompt, messages);

    // 8) save assistant reply to memory (low importance)
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
