// src/app/api/chat/route.js

import { NextResponse } from "next/server";
import Groq from "groq-sdk";

// Use env override if you ever want to change models without touching code
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// Create Groq client once
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ✅ Health check (GET /api/chat)
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Jarvis brain online",
    hasKey: !!process.env.GROQ_API_KEY,
  });
}

// 🤖 Main Jarvis brain (POST /api/chat)
export async function POST(req) {
  try {
    // 1) Hard guard: no key
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY missing in POST /api/chat");
      return NextResponse.json(
        {
          ok: false,
          error: "NO_API_KEY",
          message:
            "Bro, my brain is misconfigured locally. GROQ_API_KEY is missing. Check .env.local.",
        },
        { status: 500 }
      );
    }

    // 2) Parse body safely
    const body = await req.json().catch(() => ({}));

    // We support multiple shapes:
    // - { text: "hi" }
    // - { message: "hi" }
    // - { input: "hi" }
    // - { messages: [{ role, content }, ...] }
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

    // 3) Build prompt
    const systemPrompt = `
You are Jarvis, a calm, supportive trading & life companion for one specific trader.

Style:
- Talk casual: "bro", "man" is fine, but not every sentence.
- Short, clear paragraphs.
- Focus on discipline, risk, emotional control and routine.

Context:
- He's a discretionary trader working on consistency and avoiding FOMO / revenge.
- When he's emotional, slow him down and get him back to his rules.
`.trim();

    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
      { role: "user", content: String(userText) },
    ];

    // 4) Call Groq with the updated model
    const completion = await groq.chat.completions.create({
      model: MODEL, // 👈 now using llama-3.3-70b-versatile by default
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Bro, I tried to reply but something glitched. Say that again?";

    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    // 🔥 REAL DEBUG HERE
    console.error("Jarvis /api/chat error:", err);

    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      String(err);

    // Send a clear error response
    return NextResponse.json(
      {
        ok: false,
        error: "JARVIS_BRAIN_ERROR",
        message:
          "Bro, my brain hit an error talking to the main server. Try again in a bit.",
        debug: message, // 👈 This is what you saw in the Network tab
      },
      { status: 500 }
    );
  }
}
