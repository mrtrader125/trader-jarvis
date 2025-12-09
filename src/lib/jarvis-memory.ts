// src/lib/jarvis-memory.ts
// ChatGPT-style memory engine for Jarvis using Supabase
// Exports: saveMemoryItem, fetchRelevantMemories, shouldAskQuestion,
//          summarizeMemory, extractMemoryFromMessage, buildPromptWithMemory

import crypto from "crypto";
import { createClient } from "@/lib/supabase/server"; // adapt path if needed
import { getNowInfo, NowInfo } from "./time";

const supabase = createClient(); // expects your existing server-side supabase creator

// --------------------------- Types ---------------------------
export type MemoryItem = {
  user_id: string | number;
  type?: string; // e.g., "smalltalk", "preference", "trade", "event", "summary"
  text: string;
  tags?: string[]; // e.g., ["how_are_you"]
  importance?: number; // 1-10
  source?: string;
  timezone?: string;
  created_at?: string;
  hash?: string;
};

// --------------------------- Utilities ---------------------------
function makeHash(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function normalizeTags(tags?: string[] | string) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map((t) => t.toLowerCase());
  return [tags.toLowerCase()];
}

// --------------------------- Core DB functions ---------------------------
/**
 * Save a memory item (upserts by user_id + hash to avoid exact duplicates)
 */
export async function saveMemoryItem(item: MemoryItem) {
  const now = getNowInfo(item.timezone || "Asia/Kolkata");
  const hash = item.hash || makeHash(item.text);
  const record = {
    user_id: item.user_id?.toString(),
    type: item.type || "misc",
    text: item.text,
    tags: normalizeTags(item.tags),
    importance: item.importance ?? 3,
    source: item.source || "app",
    hash,
    created_at: item.created_at || now.iso,
    timezone: item.timezone || now.timezone,
  };

  const { data, error } = await supabase
    .from("jarvis_memory")
    .upsert(record, { onConflict: ["user_id", "hash"] });

  if (error) {
    console.error("saveMemoryItem error", error);
    throw error;
  }
  return data;
}

/**
 * Fetch relevant memories for a user with recency + importance weighting.
 * - intent: optional tag/keyword to filter (e.g., 'trading', 'how_are_you')
 * - horizonHours: timeframe to consider (default 7 days)
 * - maxItems: maximum records returned
 */
export async function fetchRelevantMemories(
  userId: string | number,
  intent: string | null = null,
  horizonHours = 24 * 7,
  maxItems = 12
) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - horizonHours * 3600 * 1000).toISOString();

  let query = supabase
    .from("jarvis_memory")
    .select("*")
    .eq("user_id", userId.toString())
    .gte("created_at", cutoff)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false });

  if (intent) {
    // use ilike on tags text representation (Supabase/Postgres array handling may vary)
    query = query.ilike("tags::text", `%${intent.toLowerCase()}%`);
  }

  const { data, error } = await query.limit(maxItems);

  if (error) {
    console.error("fetchRelevantMemories error", error);
    return [];
  }
  return data || [];
}

/**
 * Decide whether Jarvis should ask a question again.
 * questionKey is a tag like 'how_are_you'
 * horizonHours: do not re-ask if answered within this many hours
 * returns { shouldAsk: boolean, lastAnswer?: string|null, lastAt?: string|null }
 */
export async function shouldAskQuestion(
  userId: string | number,
  questionKey: string,
  horizonHours = 24
) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - horizonHours * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("jarvis_memory")
    .select("*")
    .eq("user_id", userId.toString())
    .ilike("tags::text", `%${questionKey}%`)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("shouldAskQuestion error", error);
  }

  const last = (data && data[0]) || null;
  return { shouldAsk: !last, lastAnswer: last ? last.text : null, lastAt: last ? last.created_at : null };
}

/**
 * Summarize memory (simple reducer or LLM summarizer hook).
 * - For production: replace internal summarizer below with an LLM summarization call
 *   that condenses many memory items into a short paragraph.
 */
export async function summarizeMemory(userId: string | number, horizonHours = 24 * 30) {
  const items = await fetchRelevantMemories(userId, null, horizonHours, 200);
  if (!items || items.length === 0) return { summary_short: "", count: 0 };

  // Lightweight summarizer: take top 20 and join; you can replace with LLM call.
  const short = items
    .slice(0, 20)
    .map((it: any) => `${it.type}:${(it.text || "").slice(0, 160)}`)
    .join("\n");

  return { summary_short: short, count: items.length, top: items.slice(0, 10) };
}

// --------------------------- Extraction ---------------------------
/**
 * Basic heuristic-based memory extractor.
 * Given a message text, decide if it should be saved and how to tag it.
 * This is intentionally simple — swap in an LLM extractor for production.
 */
export function extractMemoryFromMessage(message: string) {
  const text = (message || "").trim();
  if (!text) return null;

  const tags: string[] = [];
  let type = "misc";
  let importance = 3;

  const lowered = text.toLowerCase();

  // smalltalk detection
  if (/(how('| i)?s your day|how are you|how's your day|how are you doing)/i.test(lowered)) {
    type = "smalltalk";
    tags.push("how_are_you");
    importance = 2;
  }
  // user preference / profile simple patterns
  if (/i (prefer|like|love|hate) /i.test(lowered) || /my (name|age|job)/i.test(lowered)) {
    type = "preference";
    tags.push("preference");
    importance = 8;
  }
  // trade or numeric content
  if (/(loss|win|profit|pnl|-?r|trade|drawdown|long|short|entered at|exited at)/i.test(lowered)) {
    type = "trade";
    tags.push("trade");
    importance = 7;
  }
  // emotional state
  if (/(sad|bad|depressed|stressed|happy|excited|angry)/i.test(lowered)) {
    tags.push("emotion");
    importance = Math.max(importance, 6);
  }

  // If nothing matched, ignore saving by default (avoid noisy store)
  const shouldSave = type !== "misc" || tags.length > 0;
  if (!shouldSave) return null;

  return {
    text,
    type,
    tags,
    importance,
  } as Partial<MemoryItem>;
}

// --------------------------- Prompt builder ---------------------------
/**
 * Build system prompt parts to inject into LLM call.
 * - nowInfo: result of getNowInfo()
 * - memorySummary: output of summarizeMemory()
 * - lastAnswersForQuestions: optionally pass lastAnswer for blocked re-ask
 */
export function buildPromptWithMemory({
  nowInfo,
  memorySummary,
  lastAnswersForQuestions,
}: {
  nowInfo: NowInfo;
  memorySummary?: { summary_short: string; count: number };
  lastAnswersForQuestions?: Record<string, { lastAnswer: string | null; lastAt?: string | null }>;
}) {
  const timeBlock = `Time context:
- now: ${nowInfo.human} (ISO: ${nowInfo.iso})
- timezone: ${nowInfo.timezone}
- phase: ${nowInfo.phase}
`;

  const memoryBlock = memorySummary && memorySummary.summary_short
    ? `Recent memory summary (condensed):\n${memorySummary.summary_short}\n--- End memory summary ---`
    : "Recent memory summary: (no recent memory)";

  let repeatHints = "";
  if (lastAnswersForQuestions) {
    repeatHints = Object.entries(lastAnswersForQuestions)
      .map(([k, v]) => {
        if (!v.lastAnswer) return "";
        return `Question-key: ${k} -> Last answer (at ${v.lastAt || "unknown"}): "${v.lastAnswer}"`;
      })
      .filter(Boolean)
      .join("\n");
    if (repeatHints) repeatHints = `Repeat control:\n${repeatHints}\nDo not re-ask any of the above questions unless the user explicitly requests an update.`;
  }

  // Final system instruction template
  const systemPrompt = `
You are Jarvis — a helpful, stable, and precise assistant specialized in assisting this user.
${timeBlock}

${memoryBlock}

${repeatHints}

Rules:
- Always consult the memory summary before asking personal or repeated questions.
- Do NOT ask the same small-talk or personal question if the user answered it within the configured horizon (server-side check handles this).
- If you must reference a prior answer, do so concisely and ask if they want to update it.
- Prioritize short, actionable replies when the user's recent messages show trading context.

End system instructions.
`;
  return systemPrompt;
}
