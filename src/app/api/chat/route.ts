// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNowInfo } from "@/lib/time";
import {
  extractMemoryFromMessage,
  fetchRelevantMemories,
  saveMemoryItem,
  shouldAskQuestion,
  summarizeMemory,
} from "@/lib/jarvis-memory";
import { buildSystemPrompt } from "@/lib/jarvis/systemPrompt";
import { getMarketStatus } from "@/lib/markets";

// Try to import your groq client if your project exports it.
// If not present, code falls back to an environment-based fetch adapter.
let groqClient: any = null;
try {
  // adapt this path if your project uses a different export
  // e.g. export { groqClient } from "@/lib/groq";
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const g = require("@/lib/groq");
  groqClient = g?.groqClient || g?.default || null;
} catch (e) {
  groqClient = null;
}

/**
 * callLLM: unified LLM caller that uses groqClient if available,
 * otherwise falls back to a REST call using GROQ_API_KEY (if provided).
 *
 * IMPORTANT:
 * - If your project already has a `lib/groq` client, ensure it exposes `groqClient.chat.create` or modify below to use the right method.
 * - If you use Groq PSQL or a custom wrapper, replace this function with direct calls to that wrapper.
 */
async function callLLM(systemPrompt: string, messages: { role: string; content: string }[]) {
  // prefer your project's groqClient if available
  if (groqClient && typeof groqClient.chat === "object") {
    // many Groq SDKs expose a chat.create or similar. Try common variants:
    if (typeof groqClient.chat.create === "function") {
      const resp = await groqClient.chat.create({
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        // Adjust params as your groq client expects (model, temperature, etc.)
      });
      // adapt to response shape
      return resp?.choices?.[0]?.message?.content ?? resp?.output ?? String(resp);
    }
    if (typeof groqClient.chat === "function") {
      // alternate API shape
      const resp = await groqClient.chat({
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      });
      return resp?.choices?.[0]?.message?.content ?? resp?.output ?? String(resp);
    }
    // fallback: attempt a generic call
    const resp = await groqClient.request?.({ systemPrompt, messages }) ?? null;
    if (resp) return resp?.output ?? JSON.stringify(resp);
  }

  // Fallback: call Groq REST (you must set GROQ_API_KEY in env)
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const GROQ_API_URL = process.env.GROQ_API_URL || "https://api.groq.ai/v1"; // adjust if needed
  if (!GROQ_API_KEY) {
    throw new Error("No Groq client found and GROQ_API_KEY not set. Please add your groq client or set GROQ_API_KEY.");
  }

  // Compose a minimal request body matching common Groq REST chat endpoints
  const payload = {
    model: process.env.GROQ_MODEL || "gpt-4o-mini", // change to your model
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    max_tokens: 1200,
    temperature: 0.2,
  };

  const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Groq API error: ${res.status} ${txt}`);
  }
  const json = await res.json();
  // adapt to response shape
  return json?.choices?.[0]?.message?.content ?? json?.output ?? JSON.stringify(json);
}

// -------------------- Chat Route --------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId || body.user_id || body.user?.id || "anon";
    const timezone = body.timezone || "Asia/Kolkata";
    const message = (body.message || body.text || "").toString();

    if (!message) return NextResponse.json({ error: "No message provided" }, { status: 400 });

    // 1) extract & save memory if relevant
    const extracted = extractMemoryFromMessage(message);
    if (extracted) {
      await saveMemoryItem({
        user_id: userId,
        type: extracted.type,
        text: extracted.text,
        tags: extracted.tags,
        importance: extracted.importance,
        timezone,
        source: "user_message",
      });
    }

    // 2) time & market context
    const now = getNowInfo(timezone);
    // Example: add market status for NSE and NYSE to prompt (helps avoid incorrect market timing)
    const nse = getMarketStatus("NSE", timezone);
    const nyse = getMarketStatus("NYSE", timezone);

    // 3) memory summary
    const memorySummary = await summarizeMemory(userId, 30 * 24); // 30 days

    // 4) simple smalltalk detection -> repetition prevention
    const lower = message.toLowerCase();
    if (/(how are you|how's your day|how is your day|how are you doing)/i.test(lower)) {
      const repeatCheck = await shouldAskQuestion(userId, "how_are_you", 24);
      if (!repeatCheck.shouldAsk) {
        const replyText = `You previously said: "${repeatCheck.lastAnswer}". Do you want to update that or talk about something else?`;
        return NextResponse.json({ reply: replyText, skippedLLM: true });
      }
    }

    // 5) build system prompt (includes memory summary & time)
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

    // 6) compose messages (you should include recent history in production)
    const messages = [
      { role: "user", content: message },
    ];

    // 7) call LLM
    const assistantText = await callLLM(systemPrompt, messages);

    // 8) save assistant reply optionally
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
