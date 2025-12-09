// /lib/jarvis/knowledge/context.ts
import { listKnowledgeItems } from "./fetch";
import { KnowledgeContextBlock } from "./types";

interface BuildContextOptions {
  intentTags?: string[];  // e.g. ['trading', 'psychology']
  maxItems?: number;
}

function scoreItem(item: any, intentTags?: string[]): number {
  let score = item.importance ?? 1;

  if (intentTags && intentTags.length > 0) {
    const tags: string[] = item.tags ?? [];
    const overlaps = tags.filter((t) => intentTags.includes(t));
    score += overlaps.length * 2;
  }

  return score;
}

export async function buildKnowledgeContext(
  options: BuildContextOptions = {}
): Promise<KnowledgeContextBlock[]> {
  const all = await listKnowledgeItems({ status: "active" });

  const scored = all
    .map((item) => ({
      item,
      score: scoreItem(item, options.intentTags),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.maxItems ?? 8);

  return scored.map(({ item }) => ({
    title: item.title,
    item_type: item.item_type,
    importance: item.importance,
    content: item.content_markdown,
    instructions: item.jarvis_instructions ?? undefined,
  }));
}
