// src/lib/jarvis/systemPrompt.ts
// Helper to build the Jarvis system prompt in a clean consistent way.

import { buildPromptWithMemory } from "@/lib/jarvis-memory";
import type { NowInfo } from "@/lib/time";

interface MemorySummaryObject {
  summary_short: string;
  count: number;
}

interface SystemPromptInput {
  now: NowInfo;
  // Accept either the object form or already-extracted string (robust)
  memorySummary?: MemorySummaryObject | string | null;
  lastAnswersForQuestions?: Record<
    string,
    {
      lastAnswer: string | null;
      lastAt?: string | null;
    }
  >;
}

/**
 * buildSystemPrompt
 * Normalizes memorySummary to a string and calls the compat object form of buildPromptWithMemory.
 */
export function buildSystemPrompt({
  now,
  memorySummary,
  lastAnswersForQuestions,
}: SystemPromptInput) {
  // Normalize memorySummary to a plain string (compat with buildPromptWithMemory)
  const memorySummaryString =
    typeof memorySummary === "string"
      ? memorySummary
      : memorySummary && typeof memorySummary === "object"
      ? memorySummary.summary_short ?? ""
      : "";

  // Use the compat object signature of buildPromptWithMemory
  return buildPromptWithMemory({
    nowInfo: now,
    memorySummary: memorySummaryString,
    lastAnswersForQuestions: lastAnswersForQuestions ?? {},
  });
}
