// src/lib/openai-stream.ts
// Groq-compatible chat wrapper. Replaces previous OpenAI wrapper.
// - Uses Groq's OpenAI-compatible REST endpoint: https://api.groq.com/openai/v1/chat/completions
// - Exposes streamOpenAIResponse(messages, opts) and returns a ReadableStream that emits a single data event.
// - If you prefer the official groq-sdk, we can switch to that later.

export async function streamOpenAIResponse(
  messages: { role: string; content: string }[],
  opts?: { userId?: string; model?: string }
) {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) throw new Error("Missing GROQ_API_KEY env var");

  // Use an env override for model name; fall back to OPENAI_MODEL for compatibility
  const model = opts?.model || process.env.OPENAI_MODEL || process.env.GROQ_MODEL || "llama3-70b-8192";

  // Groq supports an OpenAI-compatible endpoint base at api.groq.com/openai.
  // Note: some deployments may want a different base (set GROQ_BASE_URL).
  const base = process.env.GROQ_BASE_URL || "https://api.groq.com/openai";
  const url = `${base}/v1/chat/completions`;

  const body = {
    model,
    messages,
    user: opts?.userId,
    temperature: Number(process.env.GROQ_TEMPERATURE ?? 0.1),
    max_tokens: Number(process.env.GROQ_MAX_TOKENS ?? 1000),
    // If you later want streaming true, switch to stream: true and implement SSE parsing.
    stream: false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Groq API error: ${res.status} ${txt}`);
  }

  const json = await res.json();
  // Extract assistant text (OpenAI-compatible response shape)
  const content =
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.text ??
    JSON.stringify(json);

  // Return a ReadableStream that emits a single SSE-like data event (keeps compatibility with existing route)
  return new ReadableStream({
    start(controller) {
      try {
        const payload = `data: ${JSON.stringify({ delta: content })}\n\n`;
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}
