// src/lib/chat-composer.ts
/**
 * chat-composer.ts
 *
 * Composes prompt for Jarvis, fetches memory context, and calls Groq LLM.
 * This file intentionally keeps a small shim converting options -> positional
 * arguments when calling memoryLib.getRelevantMemories so the signature stays stable.
 *
 * Exports:
 *  - composeAndCallJarvis({ userId, instruction, convoHistory })
 *
 * Note: This file assumes:
 *  - '@/lib/jarvis-persona' exports buildSystemPrompt()
 *  - '@/lib/jarvis-memory' exports getRelevantMemories and fetchRelevantMemories (default export memoryLib)
 *  - '@/lib/groq' exports groqClient wrapper (or adapt as needed)
 */

import { groqClient } from '@/lib/groq';
import jarvisPersona from '@/lib/jarvis-persona';
import memoryLib from '@/lib/jarvis-memory';
import mathEngine from '@/lib/math-engine';

type Message = { role: 'user' | 'assistant' | 'system'; content: string; ts?: string };

type ComposeArgs = {
  userId: string;
  instruction: string;
  convoHistory?: Message[];
  memoryLimit?: number;
};

const DEFAULT_MEMORY_LIMIT = 6;

/** Build prompt from persona + memory + convo */
async function buildPrompt(userId: string, instruction: string, convoHistory: Message[], memoryLimit = DEFAULT_MEMORY_LIMIT) {
  // 1) system prompt
  const system = jarvisPersona.buildSystemPrompt();

  // 2) fetch recent memories — positional args: (userId, tagFilter, daysRange, limit)
  // We intentionally pass null for tagFilter and daysRange here.
  const memRows = await memoryLib.getRelevantMemories(userId, null, null, memoryLimit);

  // Map memories into short text chunks
  const memoryTexts = memRows.map((m: any) => {
    if (!m) return '';
    if (typeof m.content === 'string') return m.content;
    if (m.title && !m.content) return String(m.title);
    if (m.content && typeof m.content === 'object') {
      return m.content.text ?? m.content.body ?? m.content.note ?? m.title ?? JSON.stringify(m.content);
    }
    return String(m.content ?? m.title ?? '');
  });

  // 3) session history (last N messages)
  const historyText = (convoHistory || [])
    .slice(-6)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  // Compose final prompt
  const parts = [
    system,
    '\n\n-- Retrieved memories (most recent first) --\n' + (memoryTexts.length ? memoryTexts.join('\n---\n') : 'No relevant memory found.'),
    '\n\n-- Recent session --\n' + (historyText || 'No recent messages.'),
    '\n\n-- User instruction --\n' + instruction,
    '\n\n-- Rules --\nAlways use deterministic math engine for numeric calcs.',
  ];

  return parts.join('\n\n');
}

/** Main composer: builds prompt, calls LLM, post-processes (runs math engine if required) */
export async function composeAndCallJarvis(opts: ComposeArgs) {
  const { userId, instruction, convoHistory = [], memoryLimit = DEFAULT_MEMORY_LIMIT } = opts;

  // 1) build prompt
  const prompt = await buildPrompt(userId, instruction, convoHistory, memoryLimit);

  // 2) call LLM (groqClient wrapper). Keep temperature low for deterministic answers.
  // If your groqClient API differs, adapt the call below.
  let llmResp: any;
  try {
    llmResp = await groqClient.call({
      prompt,
      temperature: 0.0,
      max_tokens: 800,
    });
  } catch (e) {
    throw new Error('LLM call failed: ' + String(e));
  }

  // 3) post-process: run any simple arithmetic placeholders through math engine.
  // We look for patterns like [[calc:1+2]] and replace with deterministic result.
  let text = String(llmResp?.text ?? llmResp?.output ?? llmResp);

  // simple calc replacement: [[calc:expr]]
  text = text.replace(/\[\[calc:([^\]]+)\]\]/g, (m, expr) => {
    try {
      const val = mathEngine.evaluateExpression(String(expr).trim());
      return String(val);
    } catch (e) {
      return `[calc_error:${String(e?.message ?? e)}]`;
    }
  });

  // Build provenance (if LLM returned sources, include them)
  const provenance = llmResp?.provenance ?? [];

  return { text, raw: llmResp, provenance };
}

export default {
  composeAndCallJarvis,
};
