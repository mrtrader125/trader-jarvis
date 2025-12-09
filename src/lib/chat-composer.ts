// src/lib/chat-composer.ts
/**
 * chat-composer.ts
 *
 * Composes prompt for Jarvis, fetches memory context, and calls Groq LLM.
 * - Robust wrapper for groqClient (tries several common method names)
 * - Uses memoryLib.getRelevantMemories (positional args)
 * - Runs deterministic math post-processing via mathEngine
 *
 * Exports:
 *  - composeAndCallJarvis({ userId, instruction, convoHistory })
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

/** Helper: resilient Groq client caller */
async function callGroqClient(prompt: string, opts: { temperature?: number; max_tokens?: number } = {}) {
  const anyClient = groqClient as any;

  // Try common method names used by various wrappers
  const attempts = ['call', 'request', 'generate', 'run', 'invoke', 'complete'];

  for (const m of attempts) {
    if (typeof anyClient[m] === 'function') {
      try {
        return await anyClient[m]({ prompt, ...opts });
      } catch (e) {
        // if method exists but fails, rethrow (we want the real error)
        throw e;
      }
    }
  }

  // If client provides a function that accepts (prompt) directly as default export
  if (typeof anyClient === 'function') {
    try {
      return await anyClient(prompt, opts);
    } catch (e) {
      throw e;
    }
  }

  // Nothing matched — throw helpful error
  throw new Error(
    'groqClient does not expose a known call method. Expected one of: call/request/generate/run/invoke/complete or a default function. Please adapt groq client wrapper to expose a callable method.'
  );
}

/** Build prompt from persona + memory + convo */
async function buildPrompt(userId: string, instruction: string, convoHistory: Message[], memoryLimit = DEFAULT_MEMORY_LIMIT) {
  const system = jarvisPersona.buildSystemPrompt();

  // fetch memories (positional args: userId, tagFilter, daysRange, limit)
  const memRows = await memoryLib.getRelevantMemories(userId, null, null, memoryLimit);

  const memoryTexts = memRows.map((m: any) => {
    if (!m) return '';
    if (typeof m.content === 'string') return m.content;
    if (m.title && !m.content) return String(m.title);
    if (m.content && typeof m.content === 'object') {
      return m.content.text ?? m.content.body ?? m.content.note ?? m.title ?? JSON.stringify(m.content);
    }
    return String(m.content ?? m.title ?? '');
  });

  const historyText = (convoHistory || [])
    .slice(-6)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const parts = [
    system,
    '\n\n-- Retrieved memories (most recent first) --\n' + (memoryTexts.length ? memoryTexts.join('\n---\n') : 'No relevant memory found.'),
    '\n\n-- Recent session --\n' + (historyText || 'No recent messages.'),
    '\n\n-- User instruction --\n' + instruction,
    '\n\n-- Rules --\nAlways use deterministic math engine for numeric calcs.',
  ];

  return parts.join('\n\n');
}

/** Evaluate LLM output for deterministic embedded calculations like [[calc:1+2]] */
function postProcessLLMText(rawText: string) {
  let text = String(rawText ?? '');

  // Replace [[calc:EXPR]] with evaluated deterministic result
  text = text.replace(/\[\[calc:([^\]]+)\]\]/g, (m, expr) => {
    try {
      const val = (mathEngine && typeof mathEngine.evaluateExpression === 'function')
        ? mathEngine.evaluateExpression(String(expr).trim())
        : null;
      return val === null || val === undefined ? `[calc_error]` : String(val);
    } catch (e) {
      return `[calc_error:${String(e?.message ?? e)}]`;
    }
  });

  return text;
}

/** Main composer: builds prompt, calls LLM, post-processes */
export async function composeAndCallJarvis(opts: ComposeArgs) {
  const { userId, instruction, convoHistory = [], memoryLimit = DEFAULT_MEMORY_LIMIT } = opts;

  const prompt = await buildPrompt(userId, instruction, convoHistory, memoryLimit);

  // Call Groq client using resilient wrapper
  let llmResp: any;
  try {
    llmResp = await callGroqClient(prompt, { temperature: 0.0, max_tokens: 800 });
  } catch (e) {
    throw new Error('LLM call failed: ' + String(e?.message ?? e));
  }

  // Normalize response text
  let text = '';
  if (typeof llmResp === 'string') {
    text = llmResp;
  } else if (llmResp && typeof llmResp === 'object') {
    // Common shapes: { text }, { output }, { choices: [{ text }] }, { result }
    text = llmResp.text ?? llmResp.output ?? (llmResp.choices?.[0]?.text) ?? llmResp.result ?? JSON.stringify(llmResp);
  } else {
    text = String(llmResp);
  }

  // Post-process deterministic calculations
  text = postProcessLLMText(text);

  const provenance = llmResp?.provenance ?? llmResp?.sources ?? [];

  return { text, raw: llmResp, provenance };
}

export default {
  composeAndCallJarvis,
};
