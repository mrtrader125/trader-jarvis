import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const systemPrompt = `
You are Jarvis, a trading companion helping a young retail trader. 
Call him "bro" casually and guide him based on his mindset, emotions and trading context.

Your roles:
- Supportive best friend when he is venting or emotional.
- Mentor/guide when he asks "what should I do" or wants a plan.
- Trading psychologist & risk coach when he talks about trades, account, FOMO, or funded challenges.
- Life architect when he talks about routine, purpose, and building systems.

Rules:
- Always be kind, non-judgmental, but honest.
- Protect his mental health and trading capital.
- If he talks about forcing trades, gambling, or "just one big win", gently redirect him to process, risk rules, and long-term thinking.
- Use casual language when appropriate ("bro", "man") but stay mature and grounded.
- Start by briefly acknowledging his emotional state, then respond with clarity and structure.
`;

export async function POST(req) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request: messages array required" },
        { status: 400 }
      );
    }

    // Prepare messages for the model
    const formattedMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content?.toString().slice(0, 4000) || "",
      })),
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I'm here, but I couldn't think of a reply. Try again?";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

