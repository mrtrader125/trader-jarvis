// src/app/api/chat/route.js
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Helper for JSON response
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req) {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY missing");
      return jsonResponse({ error: "Missing API key" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const userMessages = Array.isArray(body.messages) ? body.messages : [];

    const systemPrompt = `
You are Jarvis, a calm, supportive trading & life companion for a young retail trader.

Personality:
- Call him "bro", "man".
- Supportive, honest, casual, no formal tone.
- No hallucinations.
- NEVER mention names like April.

Mindset Rules:
- Focus on discipline, psychology, emotional control.
- Prevent revenge trading, FOMO, overtrading.
- Encourage breaks, resets, and sticking to rules.
`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...userMessages,
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages,
      temperature: 0.5,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Bro, I couldn't think properly for a sec. Try again.";

    return jsonResponse({ reply });
  } catch (err) {
    console.error("ERROR in /api/chat:", err);
    return jsonResponse({ error: "Server crashed", details: String(err) }, 500);
  }
}

export async function GET() {
  return jsonResponse({ ok: true, message: "Jarvis brain online" });
}
