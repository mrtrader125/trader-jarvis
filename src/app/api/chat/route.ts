// FILE: src/app/api/chat/route.ts
export const runtime = "nodejs"; // ensure Node runtime if you need native libs or longer-running streams

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groqClient } from "@/lib/groq";
import { getNowInfo } from "@/lib/time";
import {
  isPercentOfTargetQuestion,
  buildPercentOfTargetAnswerFromText,
} from "@/lib/jarvis/math";
import { fetchMemoryForUser, saveMemory } from "@/lib/jarvis-memory";
import { streamOpenAIResponse } from "@/lib/openai-stream"; // helper to stream OpenAI responses as ReadableStream

// A robust chat route that:
// - accepts messages array and userId
// - injects memory and now-info
// - detects math questions and handles deterministic math engine
// - applies smalltalk suppression rules
// - streams LLM response back to client

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, userId } = body as {
      messages: { role: string; content: string }[];
      userId: string;
    };

    if (!messages || !Array.isArray(messages) || !userId) {
      return NextResponse.json(
        { error: "Invalid request: messages and userId required" },
        { status: 400 }
      );
    }

    // 1) Fetch short-term and long-term memory to inject
    const supabase = createClient();
    const memoryItems = await fetchMemoryForUser(supabase, userId, { limit: 6 });

    // 2) Build context preface
    const nowInfo = getNowInfo();
    const memoryPreface = memoryItems && memoryItems.length
      ? `Memory summary (most relevant):\n${memoryItems
          .map((m: any, i: number) => `${i + 1}. ${m.summary}`)
          .join("\n")}\n\n`
      : "";

    // 3) Smalltalk suppression: if the user prompt is casual smalltalk, encourage brevity
    const lastUserMsg =
      messages[messages.length - 1]?.content?.toLowerCase() ?? "";
    const isSmalltalk = /^(hi|hello|hey|how are you|what's up|sup)\b/.test(
      lastUserMsg
    );

    // 4) Deterministic math detection
    const mathDetected = isPercentOfTargetQuestion(lastUserMsg);

    // 5) Build system prompt
    const systemPrompt = `You are Jarvis — a concise, accuracy-first trading assistant. Use the injected memory when helpful. Time: ${nowInfo.iso}
${memoryPreface}`;

    const payloadMessages = [{ role: "system", content: systemPrompt }, ...messages];

    // 6) If mathDetected, compute deterministic answer first and return a combined response
    if (mathDetected) {
      const mathAnswer = buildPercentOfTargetAnswerFromText(lastUserMsg);

      // **ADJUSTED TO PROJECT saveMemory SIGNATURE** (no 'source' field)
      try {
        // call project's saveMemory(userId, payload) - keep payload fields compatible with MemoryRow type
        await saveMemory(userId, {
          summary: `Answered math question: ${lastUserMsg} => ${mathAnswer}`,
          data: { question: lastUserMsg, answer: mathAnswer },
          importance: 5,
        });
      } catch (e) {
        console.warn("saveMemory failed:", e);
      }

      const combined = `Deterministic answer:\n${mathAnswer}\n\nNow a short assistant explanation:`;
      // append combined as an assistant-guide and then stream LLM expansion
      payloadMessages.push({ role: "user", content: combined });

      // stream response
      const stream = await streamOpenAIResponse(payloadMessages, { userId });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // 7) If smalltalk & our policy says suppress casual chatter, respond briefly without long context
    if (isSmalltalk) {
      // short canned reply — still stream to keep client compatibility
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"delta":"Hey — I’m Jarvis. How can I help with trading or project tasks today?"}\n\n'
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // 8) Normal flow: stream the LLM response with memory injection
    const stream = await streamOpenAIResponse(payloadMessages, { userId });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (err: any) {
    console.error("/api/chat error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
