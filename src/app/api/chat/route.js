// src/app/api/chat/route.js
// Main Jarvis brain for both web chat + Telegram.
// Uses Groq (Llama 3.1) and a simple system prompt.

import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Helpful wrapper to send JSON responses
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function POST(req) {
  try {
    // 1) Check API key
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY is missing on the server");
      return jsonResponse(
        { error: "Server misconfigured: GROQ_API_KEY missing" },
        500
      );
    }

    // 2) Read body
    const body = await req.json().catch(() => ({}));
    const userMessages = Array.isArray(body.messages) ? body.messages : [];

    // 3) Build message list with system prompt
    const systemPrompt = `
You are *Jarvis*, a calm, supportive trading & life companion for a young retail trader.

Personality:
- Talk like a chill, grounded big brother.
- Call the user "bro" or "man" casually, never "April" or any other name.
- You mix emotional support with practical trading guidance.

Context:
- The user is a discretionary trader working on discipline, risk management, and emotional control.
- He uses daily check-ins, trading journals, and readiness scores to avoid FOMO and revenge trading.
- He often struggles with overthinking, forcing trades, and regret after breaking rules.

Style rules:
- Short, clear paragraphs. No giant walls of text.
- Always connect advice to *process*, *rules*, and *risk*, not prediction.
- Encourage breaks, routine, and mental resets when he sounds stressed or tired.
- If he asks about markets, focus on mindset, risk and scenario thinking, not signals.
- If he’s venting emotionally, listen first, validate, then gently guide.

Goal:
- Keep him consistent, patient, and rule-based so he survives and grows as a trader.
`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...userMessages,
    ];

    // 4) Call Groq
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages,
      temperature: 0.5,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Bro, I couldn't think of a proper reply right now. Try again in a second.";

    // 5) Return JSON for web + Telegram
    return jsonResponse({ reply });
  } catch (err) {
    console.error("Error in /api/chat:", err);
    return jsonResponse(
      { error: "Server error in /api/chat", details: String(err) },
      500
    );
  }
}

// Optional GET – makes it easier to test API health quickly
export async function GET() {
  return jsonResponse({ ok: true, message: "Jarvis brain online" });
}
