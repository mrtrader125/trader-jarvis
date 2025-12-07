// src/app/api/chat/route.js

import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { logJarvisConversation } from "../../../lib/supabase-server";

// Create Groq client once (server-side)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ✅ Health check (GET /api/chat)
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Jarvis brain online",
    hasKey: !!process.env.GROQ_API_KEY,
    supabaseConfigured:
      !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

// 🤖 Main Jarvis brain (POST /api/chat)
export async function POST(req) {
  try {
    // 1) Hard guard: no Groq key
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY missing in POST /api/chat");
      return NextResponse.json(
        {
          ok: false,
          error: "NO_API_KEY",
          message:
            "Bro, my brain is misconfigured on this server. GROQ_API_KEY is missing. Ask the dev to fix env.",
        },
        { status: 500 }
      );
    }

    // 2) Parse body safely
    const body = await req.json().catch(() => ({}));

    // Shape support:
    // - { text: "hi" }
    // - { message: "hi" }
    // - { input: "hi" }
    // - { messages: [{ role, content }, ...] }
    // Optional extra:
    // - { source: "web" | "telegram" | ... }
    // - { chatId: "some-id" }
    const source = body.source || "web";
    const chatId = body.chatId || "web-default";
    const userId = body.userId || null;

    let userText =
      body.text ||
      body.message ||
      body.input ||
      "";

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

    // 3) Build system prompt
    const systemPrompt = `
You are Jarvis, a calm, supportive trading & life companion for one specific trader.

Style:
- Talk casual: "bro", "man" is fine, but not every sentence.
- Short, clear paragraphs.
- Focus on discipline, risk, emotional control and routine.

Context:
- He's a discretionary trader working on consistency and avoiding FOMO / revenge.
- When he's emotional, slow him down and get him back to his rules.
`;

    // 4) Build Groq messages (simple history support)
    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
      { role: "user", content: String(userText) },
    ];

    // 5) Call Groq (using supported model)
    const completion = await groq.chat.completions.create({
      // IMPORTANT: this model currently works
      model: "llama-3.1-70b-specdec",
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Bro, I tried to reply but something glitched. Say that again?";

    // 6) Fire-and-forget logging to Supabase (don't break Jarvis if DB fails)
    logJarvisConversation({
      source,
      chatId,
      userId,
      userMessage: userText,
      assistantReply: reply,
      meta: {
        route: "/api/chat",
        model: "llama-3.1-70b-specdec",
        source,
      },
    }).catch((err) =>
      console.error("[Jarvis] Supabase log promise error:", err)
    );

    // 7) Normal response back to client
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
