// src/app/api/chat/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import composeLib from '@/lib/chat-composer';
import memoryLib from '@/lib/jarvis-memory';

// Request/Response types used by this route
type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string; ts?: string };
type ChatRequestBody = {
  userId: string;
  messages?: ChatMessage[]; // recent conversation history (last 6 recommended)
  instruction?: string; // optional single instruction (alternative to messages)
  saveConversation?: boolean; // default true
};

// Basic JSON response envelope
type ChatResponseBody = {
  success: boolean;
  text?: string;
  provenance?: string[]; // memory ids referenced
  raw?: any; // raw LLM response for debugging
  error?: string;
};

export const runtime = 'edge'; // optional: use 'nodejs' if you need node libs

async function parseJsonSafe(req: NextRequest) {
  try {
    const body = await req.json();
    return body;
  } catch (e) {
    // Fallback for cases where body isn't JSON
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = (await parseJsonSafe(req)) as ChatRequestBody | null;

  if (!body) {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' } as ChatResponseBody, { status: 400 });
  }

  const userId = String(body.userId ?? '').trim();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Missing userId' } as ChatResponseBody, { status: 400 });
  }

  // Build conversation history - prefer messages if provided; else use instruction as a single user message
  const messages: ChatMessage[] = Array.isArray(body.messages) && body.messages.length > 0
    ? body.messages.map((m: any) => ({ role: m.role ?? 'user', content: String(m.content ?? ''), ts: m.ts }))
    : (body.instruction ? [{ role: 'user', content: String(body.instruction), ts: new Date().toISOString() }] : []);

  if (messages.length === 0) {
    return NextResponse.json({ success: false, error: 'No messages or instruction provided' } as ChatResponseBody, { status: 400 });
  }

  // Keep a short window of recent messages for prompt composition (e.g., last 6)
  const convoWindow = messages.slice(-6);

  // The instruction to pass to composer: take instruction param if present, else last user message content
  const instruction = body.instruction ? body.instruction : (convoWindow.length ? convoWindow.filter(m => m.role === 'user').slice(-1)[0]?.content ?? convoWindow.slice(-1)[0].content : '');

  try {
    // Compose and call Jarvis (memory retrieval, persona, LLM call, deterministic math post-processing)
    const result = await composeLib.composeAndCallJarvis({
      userId,
      instruction,
      convoHistory: convoWindow,
    });

    // Save conversation snapshot asynchronously but don't block response heavily
    // Include summary field equal to the first 800 chars of the assistant reply + last user msg
    const summaryParts = [
      convoWindow.map(m => `${m.role}: ${m.content}`).join('\n'),
      'JARVIS_REPLY:',
      (result?.text ?? '').slice(0, 800),
    ];
    const summary = summaryParts.join('\n').slice(0, 1200);

    if (body.saveConversation !== false) {
      // attempt to save conversation; do not fail the request if DB write fails
      try {
        await memoryLib.saveConversation({
          userId,
          messages: convoWindow,
          summary,
        });
      } catch (e) {
        // write a journal entry about the failure
        await memoryLib.writeJournal(userId, { event: 'saveConversation_failed', error: String(e) }, 'chat-route');
      }
    }

    // Always write a short journal for audit/tracing
    try {
      await memoryLib.writeJournal(userId, {
        event: 'chat_request',
        instruction,
        provenance: result?.provenance ?? [],
        snippet: (result?.text ?? '').slice(0, 400),
      }, 'chat-route');
    } catch (e) {
      // journaling failure is non-fatal
      console.warn('Journal write failed:', e);
    }

    // Return structured response
    const resBody: ChatResponseBody = {
      success: true,
      text: result?.text ?? '',
      provenance: result?.provenance ?? [],
      raw: result?.raw ?? null,
    };

    return NextResponse.json(resBody, { status: 200 });
  } catch (err: any) {
    console.error('chat route error:', err);
    // Attempt to journal the error for debugging
    try {
      await memoryLib.writeJournal(userId, { event: 'chat_error', error: String(err?.message ?? err) }, 'chat-route');
    } catch (e) {
      // ignore
    }
    return NextResponse.json({ success: false, error: String(err?.message ?? err) } as ChatResponseBody, { status: 500 });
  }
}
