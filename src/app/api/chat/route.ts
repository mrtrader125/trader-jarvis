// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNowInfo } from "@/lib/time";
import { groqClient } from "@/lib/groq";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: string;
  created_at?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: ChatMessage[] = body?.messages ?? [];

    // ---- 1) Timezone: for now, hard-code to your local (we'll pull from DB later) ----
    const timezone = "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    // ---- 2) Attach timestamps to each message ----
    const messagesWithTime = messages.map((m) => {
      const sentAt =
        m.createdAt ||
        m.created_at ||
        new Date().toISOString();

      return {
        role: m.role,
        content: `[sent_at: ${sentAt}] ${m.content}`,
      };
    });

    // ---- 3) System prompt (Jarvis personality + time awareness) ----
    const systemPrompt = `
You are Jarvis, a long-term trading and life companion for ONE user.

Current real-world time:
- ISO: ${nowInfo.iso}
- Local: ${nowInfo.localeString}
- Timezone: ${nowInfo.timezone}

There is no authentication or multi-user context. Treat this as a single-user system.

Rules:
- Always use the user's local time (timezone) when talking about "now", morning, night, etc.
- Use [sent_at: ...] tags on messages to reason about how much time passed between events.
- If the user was away from the market for a while, you can estimate roughly how long based on timestamps.
- You are a supportive but honest companion: keep the user aligned with their rules and goals.
`.trim();

    const finalMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messagesWithTime,
    ];

    // ---- 4) Call Groq LLM ----
    const completion = await groqClient.chat.completions.create({
      model: "mixtral-8x7b-32768", // change to your actual model if different
      messages: finalMessages,
      stream: false,
    });

    const replyMessage = completion.choices?.[0]?.message as any;

    const replyContent =
      typeof replyMessage?.content === "string"
        ? replyMessage.content
        : Array.isArray(replyMessage?.content)
        ? replyMessage.content
            .map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
            .join("\n")
        : "Sorry, I couldn't generate a response.";

    // ---- 5) Return JSON to the frontend ----
    return NextResponse.json(
      {
        reply: replyContent,
        raw: replyMessage,
        now: nowInfo,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in /api/chat:", error);
    const message =
      error instanceof Error ? error.message : String(error);

    // Important: still return 200 so the frontend can show the error as a message
    return NextResponse.json(
      {
        reply: `Jarvis brain had an internal error: ${message}`,
        now: null,
      },
      { status: 200 }
    );
  }
}
