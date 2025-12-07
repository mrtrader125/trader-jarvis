// src/app/api/chat/route.js

import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { PRIMARY_USER_ID } from "@/lib/constants";
import {
  hasSupabase,
  logMemory,
  getRecentMemories,
  getUserProfileSummary,
} from "@/lib/supabase";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ✅ Health check (GET /api/chat)
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Jarvis brain online",
    hasKey: !!process.env.GROQ_API_KEY,
    supabaseConfigured: hasSupabase,
    model: MODEL,
  });
}

// 🤖 Main Jarvis brain (POST /api/chat)
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

    let userText = body.text || body.message || body.input || "";
    let history = [];

    if (!userText && Array.isArray(body.messages) && body.messages.length > 0) {
      history = body.messages;
      const last = body.messages[body.messages.length - 1];
      userText = last?.content || "";
    }

    if (!userText || !userText.trim()) {
      return NextResponse.json(
        { ok: false, error: "NO_INPUT", message: "No message provided" },
        { status: 400 }
      );
    }

    // 🔐 Single canonical user id for you
    const userId = body.userId || PRIMARY_USER_ID;
    const channel = body.channel || "web";

    // 🔍 Pull profile + recent raw memories if Supabase is available
    let profileRow = null;
    let recentMemories = [];

    if (hasSupabase) {
      [profileRow, recentMemories] = await Promise.all([
        getUserProfileSummary(userId),
        getRecentMemories({ userId, limit: 10 }),
      ]);
    }

    const profileText = profileRow?.summary;
    const memoryText =
      recentMemories && recentMemories.length
        ? recentMemories.map((m) => `- ${m.content}`).join("\n")
        : "";

    // Build system prompt with optional memory context
    const systemParts = [
      `You are Jarvis, a calm, supportive trading & life companion for one specific trader.`,

      `Style:
- Talk casual: "bro", "man" is fine, but not every sentence.
- Short, clear paragraphs.
- Focus on discipline, risk, emotional control and routine.`,

      `Context:
- He's a discretionary trader working on consistency and avoiding FOMO / revenge.
- When he's emotional, slow him down and get him back to his rules.`,
    ];

    if (profileText) {
      systemParts.push(
        `Long-term profile about this user (summarised from many conversations). Use this to stay consistent with who he is:\n\n${profileText}`
      );
    }

    if (memoryText) {
      systemParts.push(
        `Very recent conversation snippets. Use these to keep the flow of the last chats:\n\n${memoryText}`
      );
    }

    const systemPrompt = systemParts.join("\n\n");

    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
      { role: "user", content: String(userText) },
    ];

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Bro, I tried to reply but something glitched. Say that again?";

    // 🧠 Store memory in Supabase
    if (hasSupabase) {
      const convo = `User: ${userText}\nJarvis: ${reply}`;
      await logMemory({
        userId,
        channel,
        content: convo,
        importance: 1,
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
