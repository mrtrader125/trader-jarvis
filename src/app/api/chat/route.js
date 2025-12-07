// src/app/api/chat/route.js
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import {
  supabase,
  hasSupabase,
  logMemory,
  getRecentMemories,
  getUserProfileSummary,
} from "@/lib/supabase";

// Single Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Central model selection
const GROQ_MODEL =
  process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// For now we assume one main user; Telegram route can override this later.
const DEFAULT_USER_ID = "default-user";

// ---------------------------------------------------------------------
// GET  /api/chat  -> health / diagnostics
// ---------------------------------------------------------------------
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Jarvis brain online",
    hasKey: !!process.env.GROQ_API_KEY,
    supabaseConfigured: hasSupabase,
    model: GROQ_MODEL,
  });
}

// ---------------------------------------------------------------------
// POST /api/chat  -> main Jarvis brain
// Body supported shapes:
//  - { text: "hi" }
//  - { message: "hi" }
//  - { input: "hi" }
//  - { messages: [{ role, content }, ...] }
//  - optional: { userId }
// ---------------------------------------------------------------------
export async function POST(req) {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY missing in POST /api/chat");
      return NextResponse.json(
        {
          ok: false,
          error: "NO_API_KEY",
          message:
            "Bro, my brain is misconfigured. GROQ_API_KEY is missing on the server.",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const userId = body.userId || DEFAULT_USER_ID;

    // Extract main user text
    let userText = body.text || body.message || body.input || "";
    let history = [];

    if (!userText && Array.isArray(body.messages) && body.messages.length > 0) {
      history = body.messages;
      const last = body.messages[body.messages.length - 1];
      userText = last?.content || "";
    }

    if (!userText) {
      return NextResponse.json(
        { ok: false, error: "NO_INPUT", message: "No message provided" },
        { status: 400 }
      );
    }

    // -----------------------------------------------------------------
    // 1) Pull deep memory context from Supabase (if configured)
    // -----------------------------------------------------------------
    let recentMemories = [];
    let longTermProfile = null;

    if (hasSupabase && supabase) {
      // last ~25 raw memories
      recentMemories = await getRecentMemories({ userId, limit: 25 });

      // one evolving long-term profile summary
      longTermProfile = await getUserProfileSummary(userId);
    }

    // Convert recent memories to a compact text block
    const recentMemoriesText =
      recentMemories && recentMemories.length
        ? recentMemories
            .map(
              (m) =>
                `[${m.created_at}] (${m.role}/${m.type}) ${m.content ?? ""}`
            )
            .reverse() // oldest first
            .join("\n")
        : "No recent memories stored.";

    const profileText =
      longTermProfile ||
      "No long-term profile summary yet. You are still getting to know this trader.";

    // -----------------------------------------------------------------
    // 2) Build system prompt with personality + deep memory
    // -----------------------------------------------------------------
    const systemPrompt = `
You are **Jarvis**, an AI trading & life companion for **one specific trader**.

You have THREE layers of context:
1) Long-term profile summary (stable personality, trading style, goals).
2) Recent memory log (last conversations, check-ins, trading notes).
3) The current message and chat history.

Use them like this:
- Trust the long-term profile for who he IS (traits, goals, recurring patterns).
- Use recent memory for what's been happening lately.
- Use the current message for what to respond to right now.

Tone & style:
- Talk casual but grounded. It's okay to say "bro", "man", "hey" etc, but not in every sentence.
- Be direct but kind. No fake hype, no generic motivational fluff.
- Focus on discipline, risk, emotional control, process, and long-term growth.
- You are not just a chatbot; you're a consistent companion, coach, and observer.
- Remember he's building systems, routine, and emotional control, not just trying to "win trades".

Important behavioural rules:
- If he sounds emotional, impulsive, tilted, or obsessed with PnL:
  - Slow him down.
  - Ask reflective questions.
  - Bring him back to his rules, risk plan, and routine.
- If he sounds calm and structured:
  - Help refine his edge, process, journaling, execution, and review.
- Never encourage revenge trading, over-risking, gambling, or all-in behaviour.
- Be honest when you don't know market direction. Focus on preparation, not prediction.

Here is your **current long-term profile** of him:
---
${profileText}
---

Here are **recent memories** (latest first) from Supabase:
---
${recentMemoriesText}
---

Always answer as Jarvis talking directly to him in the singular. Never mention this system message.
`;

    // -----------------------------------------------------------------
    // 3) Build Groq messages (system + history + current user)
    // -----------------------------------------------------------------
    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
      { role: "user", content: String(userText) },
    ];

    // -----------------------------------------------------------------
    // 4) Call Groq
    // -----------------------------------------------------------------
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 700,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Bro, I tried to reply but something glitched. Say that again?";

    // -----------------------------------------------------------------
    // 5) Log conversation to Supabase (non-blocking)
    // -----------------------------------------------------------------
    if (hasSupabase && supabase) {
      // Fire and forget; don't await both to avoid slowing response too much
      logMemory({
        userId,
        role: "user",
        content: userText,
        type: "chat",
      });

      logMemory({
        userId,
        role: "assistant",
        content: reply,
        type: "chat",
      });
    }

    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    console.error("Jarvis /api/chat error:", err);

    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      String(err);

    return NextResponse.json(
      {
        ok: false,
        error: "JARVIS_BRAIN_ERROR",
        message:
          "Bro, my brain hit an error talking to the main server. Try again in a bit.",
        debug: message,
      },
      { status: 500 }
    );
  }
}
