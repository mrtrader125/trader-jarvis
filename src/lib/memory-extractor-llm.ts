// src/lib/memory-extractor-llm.ts
// Uses the shared callLLM to convert a free-text message into structured memory.
// Returns null if nothing worth saving, otherwise an object:
// { shouldSave: boolean, type, tags, importance, text }

// IMPORTANT: this uses the LLM and costs tokens; use sparingly (e.g., for non-trivial messages).

import callLLM from "./llm";

type Extracted = {
  shouldSave: boolean;
  type?: string;
  tags?: string[];
  importance?: number;
  text?: string;
};

const extractionSystem = `
You are an extractor that converts a user's message into a JSON object describing whether the message should be saved to memory.
Output MUST be valid JSON only, with keys:
- shouldSave (boolean)
- type (string: one of "smalltalk","preference","trade","event","emotion","summary","misc" or "preference")
- tags (array of short tag strings)
- importance (int 1-10)
- text (short cleaned version of the fact to store)

Rules:
- Only include fields listed above.
- If message is trivial and shouldn't be saved, return {"shouldSave": false, "type":"misc","tags": [], "importance":1, "text": ""}
- Keep "text" short (max 200 chars).
`;

export async function extractMemoryWithLLM(message: string, userId?: string | number): Promise<Extracted | null> {
  if (!message || message.trim().length === 0) return null;

  const userPrompt = `Message to extract: """${message.replace(/\"/g, '\\"')}""" 

Return JSON only.`;

  try {
    const raw = await callLLM(extractionSystem, [{ role: "user", content: userPrompt }], { temperature: 0.0, max_tokens: 300 });
    // Try to parse JSON from the LLM output robustly (strip markdown, text)
    const firstJson = raw.trim().replace(/^[\s\S]*?{/, "{").replace(/}[\s\S]*$/, (m) => m);
    // safer attempt: find first JSON substring
    const jsonMatch = raw.match(/\{[\s\S]*\}$/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;

    const parsed = JSON.parse(jsonStr);
    // normalize
    const out: Extracted = {
      shouldSave: !!parsed.shouldSave,
      type: parsed.type || "misc",
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      importance: Math.min(10, Math.max(1, Number(parsed.importance) || 1)),
      text: (parsed.text || "").toString().slice(0, 1000),
    };
    return out;
  } catch (err) {
    console.error("extractMemoryWithLLM error parsing LLM output:", err);
    return null;
  }
}

export default extractMemoryWithLLM;
