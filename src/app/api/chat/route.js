// src/app/api/chat/route.js

import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// Single-user for now – later we’ll map Telegram / web IDs into this
const JARVIS_USER_ID = "trader-1";

// Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Small helper: build a short text summary from a memory row
function memoryRowToLine(row) {
  try {
    const c = row?.content || {};
    // Prefer an explicit summary if we add it later
    if (typeof c.summary === "string" && c.summary.trim().length > 0) {
      return c.summary.trim();
    }

    const user = (c.user || "").toString();
    const reply = (c.reply || "").toString();

    if (user && reply) {
      return `You said: "${user.slice(0, 120)}" — Jarvis replied: "${reply.slice(
        0,
        120
      )}"`;
    }

    if (user) return `You said: "${user.slice(0, 160)}"`;
    if (reply) return `Jarvis told you: "${reply.slice(0, 160)}"`;

    const raw = JSON.stringify(c);
    return raw.slice(0, 160);
  } catch {
    return "";
  }
}

// 🧠 GET /api/chat – health check
export async function GET() {
  const hasKey = !!process.env.GROQ_API_KEY;
  const hasSupabase =
    !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return NextResponse.json({
    ok: true,
    message: "Jarvis brain online",
    hasKey,
    supabaseConfigured: hasSupabase,
  });
}

// 🤖 POST /api/chat – main Jarvis brain with Supabase memory
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
            "Bro, my brain is misconfigured locally. GROQ_API_KEY is missing. Check .env.local.",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Supported shapes:
    // { text }, { message }, { input }, { messages: [...] }
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

    // 2) Try to load long-term memory from Supabase (if configured)
    const supabase = getSupabaseServerClient();
    let memorySnippet = "";

    if (supabase) {
      const { data: memoryRows, error } = await supabase
        .from("jarvis_memory")
        .select("content, created_at")
        .eq("user_id", JARVIS_USER_ID)
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) {
        console.warn("Jarvis memory load error:", error);
      } else if (memoryRows && memoryRows.length > 0) {
        const lines = memoryRows
          .map(memoryRowToLine)
          .filter((line) => line && line.trim().length > 0);

        if (lines.length > 0) {
          memorySnippet =
            "Here are some important recent notes about this trader:\n- " +
            lines.join("\n- ");
        }
      }
    }

    // 3) Build system prompt, including memory if we have it
    const systemPrompt = `
You are Jarvis, a calm, supportive trading & life companion for ONE specific trader.

Style:
- Talk casual: "bro", "man" is fine, but not every sentence.
- Short, clear paragraphs.
- Focus on discipline, risk, emotional control and routine.
- Do NOT call him by any random names; just say "bro" or nothing.

Trader context:
- He's a discretionary trader working on consistency and avoiding FOMO / revenge.
- When he's emotional, slow him down and get him back to his rules.
- He wants to build long-term discipline, not quick rich fantasies.

Long-term memory about this trader:
${memorySnippet || "No previous memory available yet. Treat this as an early conversation and start building context about his patterns and goals."}
    `.trim();

    // 4) Build Groq chat messages
    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
      { role: "user", content: String(userText) },
    ];

    // 5) Call Groq
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Bro, I tried to reply but something glitched. Say that again?";

    // 6) Save this interaction to Supabase memory (fire and forget)
    if (supabase) {
      const payload = {
        user_id: JARVIS_USER_ID,
        source: body.source || "web", // we’ll pass "telegram" on the bot side
        type: "chat",
        content: {
          user: userText,
          reply,
          ts: new Date().toISOString(),
        },
      };

      supabase
        .from("jarvis_memory")
        .insert(payload)
        .then(({ error }) => {
          if (error) {
            console.warn("Jarvis memory insert error:", error);
          }
        })
        .catch((e) => {
          console.warn("Jarvis memory insert exception:", e);
        });
    }

    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    console.error("Jarvis /api/chat error:", err);

    const message =
      err?.response?.data?.error?.message || err?.message || String(err);

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
