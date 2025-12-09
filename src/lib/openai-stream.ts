// src/lib/openai-stream.ts
// Simple, robust wrapper: call OpenAI Chat Completions (non-streaming) and return a ReadableStream
// that emits a single SSE-like chunk. This avoids streaming incompatibilities during build/runtime.
// Adjust `OPENAI_API_BASE` if you use a different host.

export async function streamOpenAIResponse(messages: { role: string; content: string }[], opts?: { userId?: string }) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) throw new Error("Missing OPENAI_API_KEY env var");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const body = {
    model,
    messages,
    temperature: 0.1,
    max_tokens: 1000,
    user: opts?.userId,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${txt}`);
  }

  const json = await res.json();
  // Attempt to extract assistant content
  const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? JSON.stringify(json);

  // Create a ReadableStream that emits a single SSE-like 'data:' event then closes.
  const stream = new ReadableStream({
    start(controller) {
      try {
        // Emit a single data event: client-side SSE parser or your client can read and parse this.
        const payload = `data: ${JSON.stringify({ delta: content })}\n\n`;
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return stream;
}
