// src/lib/
// Shared LLM adapter for Groq-first usage with REST fallback.
// Exports: callLLM(systemPrompt, messages, opts)

import fetch from "node-fetch";

type Msg = { role: string; content: string };

async function tryUseLocalGroqClient(messages: Msg[], systemPrompt: string) {
  try {
    // Attempt to use your project's groq client if it exports groqClient
    // Adjust path if your lib/groq export is different.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const g = require("@/lib/groq");
    const client = g?.groqClient || g?.default || null;
    if (!client) return null;

    // Try common method shapes
    if (client.chat && typeof client.chat.create === "function") {
      const resp = await client.chat.create({
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      });
      return resp?.choices?.[0]?.message?.content ?? resp?.output ?? String(resp);
    }
    if (typeof client.chat === "function") {
      const resp = await client.chat({ messages: [{ role: "system", content: systemPrompt }, ...messages] });
      return resp?.choices?.[0]?.message?.content ?? resp?.output ?? String(resp);
    }
    // fallback generic request
    if (typeof client.request === "function") {
      const resp = await client.request({ systemPrompt, messages });
      return resp?.output ?? JSON.stringify(resp);
    }
    return null;
  } catch (e) {
    // silent fallback
    return null;
  }
}

export async function callLLM(systemPrompt: string, messages: Msg[], opts?: { model?: string; temperature?: number; max_tokens?: number; }) {
  // 1) try to use local groq client if present
  const fromClient = await tryUseLocalGroqClient(messages, systemPrompt);
  if (fromClient !== null) return fromClient;

  // 2) fallback to GROQ REST
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const GROQ_API_URL = process.env.GROQ_API_URL || "https://api.groq.ai/v1";
  const model = opts?.model || process.env.GROQ_MODEL || "gpt-4o-mini";
  const temperature = typeof opts?.temperature === "number" ? opts.temperature : 0.2;
  const max_tokens = opts?.max_tokens ?? 1200;

  if (!GROQ_API_KEY) {
    throw new Error("No groq client found and GROQ_API_KEY not set. Add your groq client or set GROQ_API_KEY in env.");
  }

  const payload = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature,
    max_tokens,
  };

  const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Groq REST error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? json?.output ?? JSON.stringify(json);
}

export default callLLM;
