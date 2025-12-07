// src/app/api/chat/route.js

import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------- optional: safe Supabase logging (non-blocking) ----------
async function logMessageToSupabase(entry) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

    // Adjust table name / columns if your schema is different
    const res = await fetch(`${SUPABASE_URL}/rest/v1/jarvis_memory`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(entry),
    });

    if (!res.ok) {
      console.error("Supabase log error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Supabase log exception:", err);
  }
}

// ---------- health check (what you just called) ----------
export async function GET() {
  return NextResponse.json({ ok: true, message: "Jarvis brain online" });
}

// ---------- main chat brain ----------
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const {
      messages = [],
      userId = "anonymous",
      source = "web", // "web" | "telegram" | etc.
      mode = "default",
    } = body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "NO_MESSAGES" },
        { status: 400 }
      );
    }

    const latestUserMessage =
      messages[messages.length - 1]?.content || "No content";

    const systemPrompt = `
You are **Jarvis**, a friendly, casual trading & life companion for ONE specific user.

Style:
- Call him "bro" naturally, but not in every sentence.
- Short, clear answers. No walls of text unless he asks for deep explanation.
- Be emotionally supportive but honest about discipline, risk and rules.

Context:
- He is a discretionary trader still working on discipline, focus and emotional control.
- Help him stay within his rules, avoid FOMO/revenge trading, and keep risk small.
- If he sounds stressed or tilted, focus more on mindset and routines than new trade ideas.

When he talks about trading:
- Ask clarifying questions before giving strong opinions.
- Emphasise risk per trade, R:R, following his plan, and journaling.

When he vents about life / emotions:
- Listen first, validate the feeling, then gently give practical advice.
`.trim();

    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Bro, I tried to answer but something glitched in my brain. Try again once more.";

    // Fire-and-forget logging: last user + assistant reply
    const timestamp = new Date().toISOString();

    logMessageToSupabase({
      user_id: userId,
      source,
      role: "user",
      content: latestUserMessage,
      created_at: timestamp,
    }).catch(() => {});

    logMessageToSupabase({
      user_id: userId,
      source,
      role: "assistant",
      content: reply,
      created_at: timestamp,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      reply,
      mode,
      source,
    });
  } catch (err) {
    console.error("Jarvis /api/chat error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "JARVIS_BRAIN_ERROR",
        message:
          "Bro, my brain hit an error talking to the main server. Try again in a bit.",
      },
      { status: 500 }
    );
  }
}
