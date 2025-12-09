// src/lib/jarvis/systemPrompt.ts
// Small helper to build the full system prompt using buildPromptWithMemory
import { buildPromptWithMemory } from "@/lib/jarvis-memory";
import { NowInfo } from "@/lib/time";

/**
 * buildSystemPrompt -- returns the string to be passed as the system message
 * params:
 * - now: result of getNowInfo(userTimezone)
 * - memorySummary: result of summarizeMemory(...)
 * - lastAnswersForQuestions: object mapping question keys to last answers
 */
export function buildSystemPrompt({
  now,
  memorySummary,
  lastAnswersForQuestions,
}: {
  now: NowInfo;
  memorySummary?: { summary_short: string; count: number };
  lastAnswersForQuestions?: Record<string, { lastAnswer: string | null; lastAt?: string | null }>;
}) {
  return buildPromptWithMemory({ nowInfo: now, memorySummary, lastAnswersForQuestions });
}
