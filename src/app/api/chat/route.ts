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

    // 1) Use your local timezone (we can later load from DB)
    const timezone = "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    // 2) Attach timestamps ONLY as hidden meta for the model
    const messagesWithTime = messages.map((m) => {
      const sentAt =
        m.createdAt ||
        m.created_at ||
        new Date().toISOString();

      // Add [sent_at: ...] ONLY to user messages, keep assistant text clean
      if (m.role === "user") {
        return {
          role: m.role,
          content: `[sent_at: ${sentAt}] ${m.content}`,
        };
      }

      // For assistant/system, pass content as-is
      return {
        role: m.role,
        content: m.content,
      };
    });

    // 3) System prompt: Jarvis knows the time but keeps it internal
    const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE user.

You are TIME-AWARE:

- Current time (FOR INTERNAL REASONING ONLY, DO NOT SAY THIS UNLESS ASKED):
  - ISO: ${nowInfo.iso}
  - Local: ${nowInfo.localeString}
  - Timezone: ${nowInfo.timezone}

You will see user messages sometimes start with tags like:
  [sent_at: 2025-12-08T01:21:27.232Z]

Those tags are METADATA ONLY:
- Use them to estimate how much time passed between events.
- NEVER repeat these tags or show them in your reply.
- NEVER quote the full timestamp unless the user specifically asks.

Behavior rules:
- Only mention the current time or date if the user explicitly asks
  ("what time is it", "what day is it", "how long has it been", etc.).
- Otherwise, use time implicitly to give better guidance
  (e.g., "it's late for you", "you've been away from the market for a few hours")
  WITHOUT dumping exact clock/timestamps unless necessary.
- Stay supportive but honest, always pulling the user back to their trading
  rules, routine, and emotional discipline.
`.trim();

    const finalMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messagesWithTime,
    ];

    // 4) Call Groq
    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
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

    return NextResponse.json({ reply: replyContent }, { status: 200 });
  } catch (error: unknown) {
    console.error("CHAT API ERROR:", error);
    const message =
      error instanceof Error ? error.message : String(error);

    // Return 200 so UI doesn't freak out; show error as Jarvis text
    return NextResponse.json(
      { reply: "Jarvis brain crashed: " + message },
      { status: 200 }
    );
  }
}
