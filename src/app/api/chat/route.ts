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

function isTimeQuestion(text: string | undefined | null): boolean {
  if (!text) return false;
  const q = text.toLowerCase();
  return (
    q.includes("current time") ||
    q.includes("time now") ||
    q.includes("what's the time") ||
    q.includes("whats the time") ||
    q === "time?" ||
    q === "time"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: ChatMessage[] = body?.messages ?? [];

    const timezone = "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    const lastMessage = messages[messages.length - 1];
    const lastUserContent =
      lastMessage?.role === "user" ? lastMessage.content : undefined;

    // 🔐 HARD RULE: questions about current time are answered by backend, not LLM
    if (isTimeQuestion(lastUserContent)) {
      const reply = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;
      return NextResponse.json({ reply }, { status: 200 });
    }

    // ---- For all other messages, keep time internal for Jarvis ----

    const messagesWithTime = messages.map((m) => {
      const sentAt =
        m.createdAt ||
        m.created_at ||
        new Date().toISOString();

      if (m.role === "user") {
        return {
          role: m.role,
          content: `[sent_at: ${sentAt}] ${m.content}`,
        };
      }

      return {
        role: m.role,
        content: m.content,
      };
    });

    const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE user.

You are TIME-AWARE:

- Current time (FOR INTERNAL REASONING ONLY, DO NOT SAY THIS UNLESS THE USER ASKS ABOUT TIME):
  - ISO: ${nowInfo.iso}
  - Local: ${nowInfo.localeString}
  - Timezone: ${nowInfo.timezone}

User messages may include tags like:
  [sent_at: 2025-12-08T01:57:12.000Z] message...

These tags are METADATA ONLY:
- Use them to estimate how long it's been since the last message.
- NEVER repeat the [sent_at: ...] tags or show them in your reply.
- NEVER quote the full ISO timestamp.

Behavior:
- Only mention the current time/date if the user explicitly asks.
- Otherwise, use time implicitly ("it's late for you", etc.) without dumping exact clocks.
- Stay supportive but honest, always pulling the user back to their trading rules and routine.
`.trim();

    const finalMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messagesWithTime,
    ];

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

    return NextResponse.json(
      { reply: "Jarvis brain crashed: " + message },
      { status: 200 }
    );
  }
}
