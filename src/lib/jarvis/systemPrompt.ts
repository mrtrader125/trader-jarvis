/**
 * src/lib/jarvis/systemPrompt.ts
 * Self-contained builder for Jarvis system prompt.
 */

import type { NowInfo } from "@/lib/time";

interface MemorySummaryObject { title?: string; summary?: string; importance?: number }

export function buildSystemPrompt(now?: NowInfo | null, memorySummary?: MemorySummaryObject[]) {
  const nowText = now ? `Now: ${now.iso ?? now.human ?? JSON.stringify(now)}` : "Now: unknown";
  const memoryText = (memorySummary && memorySummary.length > 0)
    ? memorySummary.slice(0,5).map(m => `- ${m.title ?? "(no title)"}: ${ (m.summary ?? "").substring(0,200) }`).join("\n")
    : "No memory summary available.";

  const prompt = `
You are Jarvis, a focused trading & operations assistant. Be concise, factual, and calm.
${nowText}

Relevant memory (short):
${memoryText}

Respond in a helpful way, preferring short actionable steps when asked.
If the user asks about system internals or errors, show logs and diagnostic hints.
`.trim();

  return prompt;
}

export default buildSystemPrompt;
