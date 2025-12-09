// src/lib/chat-composer.ts
// Composer: retrieves memories, constructs prompt (persona + memories + convo), calls Groq, post-processes math placeholders
// Full replacement — drop into src/lib.

import { createClient } from '@/lib/supabase/server';
import { groqClient } from '@/lib/groq';
import jarvisPersona from '@/lib/jarvis-persona';
import memoryLib from '@/lib/jarvis-memory';
import mathEngine from '@/lib/math-engine';

const supabase = createClient();

type Message = { role: 'user' | 'assistant' | 'system'; content: string; ts?: string };

/**
 * buildPromptFromParts: builds a single string prompt suitable for Groq complete()
 */
function buildPromptFromParts({ systemPrompt, memoryChunks, convoHistory, instruction }: {
  systemPrompt: string;
  memoryChunks: string[];
  convoHistory: Message[];
  instruction: string;
}) {
  const header = `SYSTEM:\n${systemPrompt}\n---\n`;
  const memories = memoryChunks && memoryChunks.length ? `RELEVANT_MEMORIES:\n${memoryChunks.join('\n---\n')}\n---\n` : '';
  const convo = convoHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const convoSection = `CONVERSATION:\n${convo}\n---\n`;
  const instructionSection = `INSTRUCTION:\n${instruction}\n`;
  return `${header}${memories}${convoSection}${instructionSection}`;
}

/**
 * formatMemoryChunk: format memory rows into compact prompt chunks
 */
function formatMemoryChunk(m: any) {
  const title = m.title ?? 'untitled';
  const id = m.id ?? '';
  const importance = m.importance ?? 1;
  const tags = Array.isArray(m.tags) ? m.tags.join(', ') : '';
  // Stringify content but keep it short
  let contentStr = '';
  try {
    if (typeof m.content === 'string') contentStr = m.content;
    else contentStr = JSON.stringify(m.content);
  } catch (e) {
    contentStr = String(m.content);
  }
  if (contentStr.length > 1200) contentStr = contentStr.slice(0, 1200) + '...';
  return `MEMORY_ID:${id} | TITLE:${title} | IMPORTANCE:${importance} | TAGS:${tags}\n${contentStr}`;
}

/**
 * postProcessMathPlaceholders:
 * Finds [[MATH: ...expression...]] placeholders in text and replaces them with deterministic math results.
 * Expression syntax is intentionally simple; we pass expression to mathEngine.evaluateExpression for safety.
 */
async function postProcessMathPlaceholders(text: string) {
  const regex = /\[\[MATH:(.+?)\]\]/g;
  const replacements: Record<string, string> = {};
  const promises: Promise<void>[] = [];

  text = text.replace(regex, (full, expr) => {
    const token = `__MATH_TOKEN_${Math.random().toString(36).slice(2,9)}__`;
    promises.push((async () => {
      try {
        const val = mathEngine.evaluateExpression(expr.trim());
        replacements[token] = String(val);
      } catch (e) {
        replacements[token] = `ERROR:${String((e as Error).message ?? e)}`;
      }
    })());
    return token;
  });

  await Promise.all(promises);
  for (const [k, v] of Object.entries(replacements)) {
    text = text.split(k).join(v);
  }
  return text;
}

/**
 * composeAndCallJarvis: primary function to call from API routes
 * - userId: user's identifier (string)
 * - instruction: the user's new instruction (string)
 * - convoHistory: array of recent messages
 */
export async function composeAndCallJarvis({ userId, instruction, convoHistory }: {
  userId: string;
  instruction: string;
  convoHistory: Message[];
}) {
  // 1) Build system persona
  const systemPrompt = jarvisPersona.buildSystemPrompt();

  // 2) Retrieve top memories related to instruction
  let memResp: any = { data: [] };
  try {
    memResp = await memoryLib.getRelevantMemories({ userId, queryText: instruction, limit: 6 });
  } catch (e) {
    console.warn('composeAndCallJarvis: memoryLib.getRelevantMemories failed', e);
  }
  const rawMems = memResp?.data ?? [];

  // 3) Format memory chunks
  const memoryChunks = (rawMems || []).map(formatMemoryChunk);

  // 4) Build prompt text
  const prompt = buildPromptFromParts({ systemPrompt, memoryChunks, convoHistory, instruction });

  // 5) Call Groq for completion
  let groqResp: any = null;
  try {
    groqResp = await (groqClient as any).complete({
      prompt,
      temperature: 0.12,
      max_tokens: 700,
    });
  } catch (e) {
    console.error('groqClient.complete error:', e);
    throw new Error('LLM call failed');
  }

  // extract text from common response shapes
  let generated = groqResp?.choices?.[0]?.text ?? groqResp?.output ?? (typeof groqResp === 'string' ? groqResp : '');

  // 6) Post-process math placeholders deterministically
  try {
    generated = await postProcessMathPlaceholders(generated);
  } catch (e) {
    console.warn('postProcessMathPlaceholders failed:', e);
  }

  // 7) Prepare provenance (list memory ids included)
  const provenance = (rawMems || []).slice(0, 6).map((m: any) => m.id).filter(Boolean);

  // 8) Return composed response
  return {
    text: String(generated).trim(),
    provenance,
    raw: groqResp,
  };
}

export default {
  composeAndCallJarvis,
};
