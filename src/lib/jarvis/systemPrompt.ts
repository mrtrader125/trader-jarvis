// /lib/jarvis/systemPrompt.ts

import { buildKnowledgeContext } from "@/lib/jarvis/knowledge/context";

/**
 * Very dumb intent-tag detector.
 * Later we can make this smarter, but for now it's fine.
 */
function detectIntentTags(userMessage: string): string[] {
  const text = userMessage.toLowerCase();
  const tags: string[] = [];

  if (
    text.includes("trade") ||
    text.includes("trading") ||
    text.includes("chart") ||
    text.includes("entry") ||
    text.includes("stop loss") ||
    text.includes("risk")
  ) {
    tags.push("trading");
  }

  if (
    text.includes("psychology") ||
    text.includes("emotion") ||
    text.includes("fear") ||
    text.includes("revenge") ||
    text.includes("discipline") ||
    text.includes("tilt")
  ) {
    tags.push("psychology");
  }

  if (
    text.includes("money") ||
    text.includes("salary") ||
    text.includes("expenses") ||
    text.includes("freedom") ||
    text.includes("runway")
  ) {
    tags.push("money", "freedom");
  }

  // Always at least one default tag
  if (tags.length === 0) {
    tags.push("general");
  }

  return tags;
}

/**
 * Build the full system prompt that Jarvis will receive.
 * It pulls your knowledge items from the Data Center and injects them.
 */
export async function buildJarvisSystemPrompt(params: {
  latestUserMessage: string;
}): Promise<string> {
  const { latestUserMessage } = params;

  const intentTags = detectIntentTags(latestUserMessage);

  // Fetch relevant knowledge from Supabase
  const knowledgeBlocks = await buildKnowledgeContext({
    intentTags,
    maxItems: 8,
  });

  const knowledgeSection =
    knowledgeBlocks.length === 0
      ? "No explicit user knowledge has been defined yet."
      : knowledgeBlocks
          .map(
            (b) => `
### ${b.title} [${b.item_type}, importance ${b.importance}]
${b.content}

${
  b.instructions
    ? `How Jarvis must use this:\n${b.instructions}\n`
    : ""
}`
          )
          .join("\n");

  const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE specific user.

GENERAL BEHAVIOR:
- Obey the user's personal rules and teachings below.
- Never contradict them unless they are mathematically or logically wrong.
- Stay calm, stable, and emotionally grounded.
- Be brutally honest but supportive. Protect their capital and mental health.

USER TEACHINGS (KNOWLEDGE CENTER):
The user has manually taught you the following rules, concepts, formulas, and stories.
These are HIGH PRIORITY. Follow them strictly, unless they clearly conflict with basic logic or math.

${knowledgeSection}

WHEN ANSWERING:
- If the question is about trading psychology or emotions, heavily lean on the psychology rules above.
- If the question is about money, freedom, or "worry-free" lifestyle, use the money & freedom teachings above.
- If the question is about calculations, use deterministic math (no guessing). If a formula is defined in the knowledge, follow it exactly.
- If knowledge is missing or incomplete, say what is missing and ask the user to teach you via the Data Center (Jarvis Knowledge page).

NEVER:
- Invent fake personal rules.
- Ignore or override the user's defined teachings.
- Give overconfident answers when the knowledge is incomplete.

Remember: your job is to think WITH the user using THEIR framework, not a generic one.
`;

  return systemPrompt.trim();
}
