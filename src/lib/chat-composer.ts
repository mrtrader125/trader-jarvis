/**
 * Full replacement chat-composer.ts
 *
 * Behavior:
 *  - Tries to import an existing project LLM wrapper (src/lib/llm or src/lib/groq).
 *  - Optionally pulls in systemPrompt builder and jarvis memory if available.
 *  - Falls back to OpenAI API if OPENAI_API_KEY is present.
 *  - If all else fails, returns a deterministic canned assistant reply (safe fallback).
 *
 * Shape returned:
 *  { messages: Msg[], meta: { memoryCount?: number, memoryRows?: any } }
 *
 * Where Msg = { role: "assistant" | "user" | "system", content: string }
 *
 * This file is defensive and should not throw on import failures.
 */

type Msg = { role: "assistant" | "user" | "system"; content: string };

interface ComposeOpts {
  userId?: string;
  messages?: Array<{ role: string; content: string }>;
  meta?: Record<string, any>;
  // optional hints
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

async function tryImport(path: string) {
  try {
    // dynamic import; allow for relative resolution by trying both TS alias and relative
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import(path).catch(() => null);
    return mod ?? null;
  } catch {
    return null;
  }
}

async function tryGetSystemPrompt(userId?: string, nowInfo?: any): Promise<string | null> {
  try {
    // try common paths for systemPrompt builder
    const candidates = [
      "@/lib/jarvis/systemPrompt",
      "@/lib/jarvis/systemPrompt.ts",
      "./lib/jarvis/systemPrompt",
      "@/lib/jarvis/systemPrompt.ts",
    ];
    for (const p of candidates) {
      const mod = await tryImport(p);
      if (!mod) continue;
      // prefer default export or named buildSystemPrompt / default function
      const fn = mod.buildSystemPrompt ?? mod.default ?? mod.buildPromptWithMemory ?? null;
      if (typeof fn === "function") {
        const maybe = await fn(userId ? { userId, nowInfo } : { nowInfo });
        if (typeof maybe === "string") return maybe;
        if (maybe && typeof maybe === "object" && "prompt" in maybe) return String((maybe as any).prompt);
      }
    }
  } catch (e) {
    // swallow
  }
  return null;
}

async function tryGetMemories(userId?: string, limit = 5) {
  try {
    const memCandidates = [
      "@/lib/jarvis-memory",
      "@/lib/jarvis/jarvis-memory",
      "@/lib/jarvis-memory.ts",
      "@/lib/jarvis/memory",
      "@/lib/jarvis/knowledge/fetch",
    ];
    for (const p of memCandidates) {
      const mod = await tryImport(p);
      if (!mod) continue;
      // prefer fetchRelevantMemories or getRelevantMemories
      const fn = mod.fetchRelevantMemories ?? mod.getRelevantMemories ?? mod.fetchMemories ?? null;
      if (typeof fn === "function") {
        const rows = await fn(userId ?? "debug", { limit });
        return { count: Array.isArray(rows) ? rows.length : 0, rows };
      }
    }
  } catch (e) {
    // swallow
  }
  return { count: 0, rows: [] };
}

async function callProjectLLM(payload: { messages: Msg[]; model?: string; temperature?: number; maxTokens?: number }) {
  // try project-provided LLM wrappers
  const llmCandidates = ["@/lib/llm", "@/lib/groq", "@/lib/groqClient", "@/lib/groq-client", "@/lib/ai/llm"];
  for (const p of llmCandidates) {
    const mod = await tryImport(p);
    if (!mod) continue;
    // common exported shapes:
    //  - async function callChat({messages, model, ...})
    //  - export default { callChat }
    //  - export async function chat(...)
    //  - export async function call(...)
    const fnCandidates = [
      "callChat",
      "chat",
      "call",
      "generate",
      "createChatCompletion",
      "createCompletion",
      "complete",
      "composeAndCallJarvis",
      "compose",
    ];
    for (const name of fnCandidates) {
      const fn = mod[name] ?? (mod.default && mod.default[name]) ?? null;
      if (typeof fn === "function") {
        try {
          const result = await fn({ messages: payload.messages, model: payload.model, temperature: payload.temperature, maxTokens: payload.maxTokens });
          // flexible: support returning string, message obj, or chat response
          if (!result) continue;
          if (typeof result === "string") return { text: result, raw: result };
          if (Array.isArray(result.messages)) return { messages: result.messages, raw: result };
          if (result.choices && Array.isArray(result.choices) && result.choices.length) {
            // OpenAI-like shape
            const text = result.choices[0].message?.content ?? result.choices[0].text ?? "";
            return { text, raw: result };
          }
          if (result.text) return { text: result.text, raw: result };
          return { raw: result };
        } catch (e) {
          // try next
          continue;
        }
      }
    }
  }
  return null;
}

async function callOpenAIChat(payload: { messages: Msg[]; model?: string; temperature?: number; maxTokens?: number }) {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!key) return null;
  const model = payload.model ?? process.env.GROQ_MODEL ?? "gpt-4o-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: payload.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: payload.maxTokens ?? 800,
        temperature: typeof payload.temperature === "number" ? payload.temperature : 0.0,
      }),
    });
    const j = await res.json();
    if (!j) return null;
    if (j.choices && j.choices.length) {
      const content = j.choices[0].message?.content ?? j.choices[0].text ?? "";
      return { text: String(content), raw: j };
    }
    return { raw: j };
  } catch (e) {
    return null;
  }
}

export async function compose(opts?: ComposeOpts) {
  const userId = opts?.userId ?? "debug";
  const incoming = Array.isArray(opts?.messages) ? opts!.messages.map((m) => ({ role: (m.role as any) ?? "user", content: String(m.content ?? "") })) : [{ role: "user", content: "hello" }];

  // 1) build system prompt if available
  const systemPrompt = (await tryGetSystemPrompt(userId)) ?? "You are Jarvis, a helpful, concise, and math-first trading assistant. Answer precisely and avoid small talk.";

  // 2) fetch memories (optional)
  const memoryInfo = await tryGetMemories(userId, 6);

  // 3) assemble final message list: system, memory summary (if any), then incoming user messages
  const messages: Msg[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  if (memoryInfo && memoryInfo.count && memoryInfo.count > 0) {
    // create a short memory digest (limit characters)
    const rows = memoryInfo.rows ?? [];
    try {
      const digest = Array.isArray(rows)
        ? rows
            .slice(0, 6)
            .map((r: any, i: number) => {
              // try common fields
              if (typeof r === "string") return `- ${r}`;
              const title = r.title ?? r.summary ?? r.text ?? r.item ?? r.rule ?? "";
              return title ? `- ${String(title).slice(0, 200)}` : `- ${JSON.stringify(r).slice(0, 120)}`;
            })
            .join("\n")
        : "";
      if (digest) messages.push({ role: "system", content: `Relevant memories for this user:\n${digest}` });
    } catch {}
  }

  // append conversation (incoming)
  for (const m of incoming) messages.push({ role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user", content: String(m.content) });

  // 4) Try to call any project LLM wrapper first
  const llmResp = await callProjectLLM({ messages, model: opts?.model ?? process.env.GROQ_MODEL, temperature: opts?.temperature ?? 0.0, maxTokens: opts?.maxTokens ?? 1000 });
  if (llmResp) {
    // Normalize into { messages, meta }
    if (Array.isArray((llmResp as any).messages)) {
      return { messages: llmResp.messages, meta: { memoryCount: memoryInfo.count, memoryRows: memoryInfo.rows, raw: llmResp.raw ?? null } };
    }
    if (typeof (llmResp as any).text === "string") {
      return { messages: [{ role: "assistant", content: (llmResp as any).text }], meta: { memoryCount: memoryInfo.count, memoryRows: memoryInfo.rows, raw: llmResp.raw ?? null } };
    }
    return { messages: [{ role: "assistant", content: "Jarvis could not produce an LLM response (project wrapper)." }], meta: { memoryCount: memoryInfo.count } };
  }

  // 5) Try OpenAI fallback
  const openaiResp = await callOpenAIChat({ messages, model: opts?.model ?? undefined, temperature: opts?.temperature ?? 0.0, maxTokens: opts?.maxTokens ?? 1000 });
  if (openaiResp) {
    if (typeof openaiResp.text === "string") {
      return { messages: [{ role: "assistant", content: openaiResp.text }], meta: { memoryCount: memoryInfo.count, raw: openaiResp.raw ?? null } };
    }
    return { messages: [{ role: "assistant", content: "Jarvis could not parse LLM response (openai)." }], meta: { memoryCount: memoryInfo.count } };
  }

  // 6) final fallback - deterministic reply (safe)
  return {
    messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }],
    meta: { memoryCount: memoryInfo.count ?? 0, memoryRows: memoryInfo.rows ?? [] },
  };
}

// keep backwards-compatible exports used across routes
export const composeAndCallJarvis = compose;
export default { compose, composeAndCallJarvis };
