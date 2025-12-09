// src/lib/jarvis/systemPrompt.ts
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
}
