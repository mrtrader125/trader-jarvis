// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal browser chat endpoint.
 * Expected request body:
 * {
 *   messages: [{ role: 'user'|'system'|'assistant', content: '...' }, ...],
 *   userId: 'string'
 * }
 *
 * This handler echoes back a simple reply if the LLM is not wired in.
 * Replace the `generateReply` implementation with a call to your LLM / openai-stream / groq as needed.
 */

type ChatMessage = { role: string; content: string };

async function generateReply(messages: ChatMessage[], userId?: string) {
  // Placeholder: default behavior is to echo the last user message.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const incoming = lastUser?.content ?? (messages.length ? messages[messages.length - 1].content : "");
  const reply = `Jarvis echo: ${incoming}`;
  return reply;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });

    const { messages, userId } = body;
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ ok: false, error: "missing messages array" }, { status: 400 });
    }

    // generate (or forward to your LLM)
    const replyText = await generateReply(messages, userId);

    return NextResponse.json({ ok: true, reply: replyText });
  } catch (err: any) {
    console.error("[chat route] error:", err?.message ?? err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
