<<<<<<< HEAD
﻿// src/lib/jarvis/systemPrompt.ts
/**
 * Helper to build a compact Jarvis system prompt.
 * Kept simple and deterministic so tests and builds succeed.
 */

export interface NowInfo {
  iso?: string;
  tz?: string;
  human?: string;
}

interface MemorySummary {
  title?: string;
  summary?: string;
}

export default function buildSystemPrompt(now: NowInfo | null = null, memorySummaries: MemorySummary[] = []) {
  const when = now?.human ? `Time: ${now.human}` : now?.iso ? `Time: ${now.iso}` : "Time: unknown";
  const mem = (memorySummaries && memorySummaries.length > 0)
    ? `Memory summary:\n${memorySummaries.map((m, i) => `${i+1}. ${m.title ?? "item"} - ${m.summary ?? ""}`).join("\n")}`
    : "Memory: (none)";

  const prompt = [
    "You are Jarvis — a calm, precise trading & operations assistant.",
    when,
    mem,
    "",
    "Rules:",
    "- Use concise, actionable language.",
    "- If asked about sensitive actions (money, trading rules, deletion), show a short caution and ask for confirmation.",
    "- Always be deterministic in calculations; show formulae where helpful.",
    "",
    "When replying include the 'role' (assistant) and a helpful text response."
  ].join("\n");

  return prompt;
=======
// src/lib/jarvis/systemPrompt.ts
/**
 * Build the system prompt used by Jarvis.
 *
 * This file is written defensively because different versions of jarvis-memory
 * might export the helper in different shapes:
 *  - named export: export function buildPromptWithMemory(...) { ... }
 *  - default export: export default function(...) { ... }
 *
 * We attempt to resolve either shape. If the helper is missing, we provide
 * a conservative fallback that concatenates a short system prompt with
 * an optional memory summary.
 */

import type { NowInfo } from "@/lib/time";

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as JarvisMemoryModule from "@/lib/jarvis-memory";

/**
 * Resolve buildPromptWithMemory function from the jarvis-memory module.
 * Returns null if not found.
 */
function resolveBuildPromptWithMemory(mod: any): ((opts: { now?: NowInfo; memorySummary?: string }) => string) | null {
  if (!mod) return null;

  // Named export
  if (typeof (mod as any).buildPromptWithMemory === "function") {
    return (mod as any).buildPromptWithMemory;
  }

  // Default export is a function
  if (typeof (mod as any).default === "function") {
    return (mod as any).default;
  }

  // Sometimes default is an object with the function on it
  if ((mod as any).default && typeof (mod as any).default.buildPromptWithMemory === "function") {
    return (mod as any).default.buildPromptWithMemory;
  }

  return null;
}

const buildPromptWithMemoryResolved = resolveBuildPromptWithMemory(JarvisMemoryModule);

/**
 * Fallback builder used when jarvis-memory doesn't provide a prompt builder.
 * Keeps things simple and safe for compilation.
 */
function fallbackBuildPromptWithMemory(opts: { now?: NowInfo; memorySummary?: string }) {
  const now = opts?.now ?? { iso: new Date().toISOString() } as NowInfo;
  const memory = opts?.memorySummary ? `\n\nMemory Summary:\n${opts.memorySummary}` : "";
  return [
    `You are Jarvis — a concise, helpful trading assistant.`,
    `Current time: ${("iso" in (now as any) ? (now as any).iso : JSON.stringify(now))}.`,
    `You must follow user trading rules and never give financial advice beyond the user's rules.`,
    memory,
    `Respond in clear step-by-step language and keep answers short unless asked for details.`,
  ].join("\n");
}

/**
 * Main exported function.
 *
 * @param now Optional time object (NowInfo)
 * @param memorySummary Optional string summary of relevant memory to include in the system prompt
 * @returns system prompt string
 */
export default function buildSystemPrompt(now?: NowInfo, memorySummary?: string) {
  const builder = buildPromptWithMemoryResolved ?? fallbackBuildPromptWithMemory;
  try {
    // Some implementations may accept (now, memorySummary) or a single options object.
    // We try the single-object form first, then fall back to (now, memorySummary).
    const maybe = (builder as any)({ now, memorySummary });
    if (typeof maybe === "string") return maybe;

    // If the builder expects positional args:
    const maybe2 = (builder as any)(now, memorySummary);
    if (typeof maybe2 === "string") return maybe2;

    // Last resort: call fallback
    return fallbackBuildPromptWithMemory({ now, memorySummary });
  } catch (e) {
    // If anything fails, return a safe fallback prompt
    console.error("[systemPrompt] builder threw:", e);
    return fallbackBuildPromptWithMemory({ now, memorySummary });
  }
>>>>>>> cdaaba7 (fix: completed Jarvis build, finalizing stable deployment)
}
