// src/lib/memory-summarizer.ts
// Summarizes memory items (by calling LLM) and optionally saves a summary memory row.

import callLLM from "./llm";
import { createClient } from "@/lib/supabase/server";

const supabase = createClient();

/**
 * summarizeItemsWithLLM: accepts an array of memory text items and returns a short summary.
 * It can optionally persist the summary to the jarvis_memory table as type 'summary'.
 */
export async function summarizeItemsWithLLM({
  userId,
  items,
  persist = false,
}: {
  userId: string | number;
  items: { id?: any; text: string; type?: string }[];
  persist?: boolean;
}) {
  if (!items || items.length === 0) return { summary: "", count: 0 };

  // create a concise prompt: ask for 2-4 sentence summary and 3 bullet points of important facts
  const system = `You are a concise memory summarizer. Given up to 200 short memory lines, produce:
1) A 1-3 sentence summary capturing the user's current situation, key preferences, and ongoing tasks.
2) Up to 5 short bullet points that are high-importance facts (one-liners).
Output JSON only: { "summary": "...", "bullets": ["...", "..."] }`;

  const payloadText = items.slice(0, 200).map((it, i) => `${i + 1}. [${it.type || "misc"}] ${it.text}`).join("\n");

  const userPrompt = `Memory items:\n${payloadText}\n\nReturn JSON only.`;

  try {
    const outRaw = await callLLM(system, [{ role: "user", content: userPrompt }], { temperature: 0.0, max_tokens: 600 });
    // parse JSON
    const match = outRaw.match(/\{[\s\S]*\}$/);
    const jsonStr = match ? match[0] : outRaw;
    const parsed = JSON.parse(jsonStr);
    const summary = parsed.summary || parsed.summary_short || "";
    const bullets = Array.isArray(parsed.bullets) ? parsed.bullets.map(String) : [];

    if (persist && summary.trim()) {
      // upsert a summary into jarvis_memory
      const record = {
        user_id: userId?.toString(),
        type: "summary",
        text: summary,
        tags: ["auto_summary"],
        importance: 8,
        source: "auto_summarizer",
      };
      const { error } = await supabase.from("jarvis_memory").insert(record);
      if (error) console.error("persist summary error", error);
    }

    return { summary, bullets, count: items.length };
  } catch (err) {
    console.error("summarizeItemsWithLLM error", err);
    return { summary: "", bullets: [], count: items.length };
  }
}

export default summarizeItemsWithLLM;
