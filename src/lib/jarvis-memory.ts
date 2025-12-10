// src/lib/jarvis-memory.ts
/**
 * Small memory helper shim.
 * Exports:
 * - buildPromptWithMemory(now, summaries) => string
 * - saveMemory(item) => Promise<void>  (stub)
 * - recallRecent(n) => Promise<Array<any>> (stub)
 *
 * Replace with full Supabase-backed memory later.
 */

export interface MemorySummary {
  id?: string;
  title?: string;
  summary?: string;
}

export function buildPromptWithMemory(now: { iso?: string; human?: string } | null, summaries: MemorySummary[] = []) {
  const when = now?.human ?? now?.iso ?? "unknown time";
  const mem = (summaries && summaries.length > 0)
    ? summaries.map((s, i) => `${i+1}. ${s.title ?? "item"} — ${s.summary ?? ""}`).join("\n")
    : "(no memory)";
  return `Time: ${when}\nMemory:\n${mem}\n\nSystem rules: be concise, precise, and show calculations.`;
}

export async function saveMemory(_item: { title?: string; content?: string }) {
  // stub: integrate with Supabase in full implementation
  console.error("[jarvis-memory] saveMemory called (stub).");
  return;
}

export async function recallRecent(_n = 5) {
  // stub: return empty list
  console.error("[jarvis-memory] recallRecent called (stub).");
  return [];
}

export default { buildPromptWithMemory, saveMemory, recallRecent };
