// src/lib/jarvis-memory.ts
/**
 * jarvis-memory.ts
 *
 * Centralized Supabase memory helpers for Jarvis.
 * - Named exports + explicit default export (memoryLib) for compatibility
 * - Provides: embedText, saveMemory, upsertMemoryEmbedding, getRelevantMemories,
 *   fetchRelevantMemories (compat wrapper), saveConversation, summarizeIfNeeded,
 *   writeJournal, getMemoryById
 * - buildPromptWithMemory supports both:
 *     a) positional: (userId, instruction, convoHistory?, memoryLimit?) => { prompt, memories }
 *     b) compat object: ({ nowInfo, memorySummary, lastAnswersForQuestions }) => string
 *
 * NOTE: Replace placeholder embedText with your actual embedding provider.
 */

import { createClient } from '@/lib/supabase/server';

export type MemoryRow = {
  id: string;
  user_id: string;
  type?: string;
  title?: string;
  content?: any;
  embedding?: any;
  importance?: number;
  tags?: string[];
  status?: string;
  created_at?: string;
  updated_at?: string;
};

export type ConversationRow = {
  id?: string;
  userId?: string;
  user_id?: string;
  messages: any[];
  summary?: string;
  last_active?: string;
  embedding?: any;
  created_at?: string;
  updated_at?: string;
};

function supabaseClient() {
  return createClient();
}

/** embedText - placeholder deterministic small vector fallback */
export async function embedText(text: string): Promise<number[] | null> {
  try {
    if (!text) return null;
    const v = new Array(8).fill(0).map((_, i) => (text.charCodeAt(i % text.length) || 0) % 100 / 100);
    return v;
  } catch (e) {
    console.warn('embedText fallback failed:', e);
    return null;
  }
}

/** saveMemory */
export async function saveMemory(userId: string, memory: Partial<MemoryRow>) {
  const supabase = supabaseClient();
  const row = {
    user_id: userId,
    type: memory.type ?? 'fact',
    title: memory.title ?? null,
    content: memory.content ?? null,
    importance: memory.importance ?? 1,
    tags: memory.tags ?? [],
    status: memory.status ?? 'active',
  };

  try {
    const { data, error } = await supabase.from('memories').insert(row).select().single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('saveMemory error:', e);
    throw e;
  }
}

/** upsertMemoryEmbedding */
export async function upsertMemoryEmbedding(memoryId: string, embedding: any) {
  const supabase = supabaseClient();
  try {
    const { data, error } = await supabase.from('memories').update({ embedding }).eq('id', memoryId).select().single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('upsertMemoryEmbedding error:', e);
    throw e;
  }
}

/**
 * getRelevantMemories(userId, tagFilter|null, daysRange|null, limit)
 * Returns MemoryRow[]
 */
export async function getRelevantMemories(
  userId: string,
  tagFilter: string[] | null = null,
  daysRange: number | null = null,
  limit: number = 50
): Promise<MemoryRow[]> {
  const supabase = supabaseClient();

  try {
    let query: any = supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (tagFilter && Array.isArray(tagFilter) && tagFilter.length > 0) {
      query = query.contains('tags', tagFilter);
    }

    if (daysRange && typeof daysRange === 'number') {
      const since = new Date(Date.now() - daysRange * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', since);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as MemoryRow[]) || [];
  } catch (e) {
    console.warn('getRelevantMemories error:', e);
    return [];
  }
}

/**
 * fetchRelevantMemories (compat wrapper)
 * Returns items: { id?, text: string, type?: string }[]
 */
export async function fetchRelevantMemories(
  userId: string,
  tagFilter: string[] | null = null,
  daysRange: number | null = null,
  limit: number = 50
): Promise<{ id?: any; text: string; type?: string }[]> {
  const rows = await getRelevantMemories(userId, tagFilter, daysRange, limit);

  return rows.map((r) => {
    let text = '';
    if (!r.content) {
      text = r.title ?? '';
    } else if (typeof r.content === 'string') {
      text = r.content;
    } else if (typeof r.content === 'object') {
      text = r.content.text ?? r.content.body ?? r.content.note ?? r.title ?? JSON.stringify(r.content);
    } else {
      text = String(r.content);
    }
    return { id: r.id, text: String(text ?? ''), type: r.type ?? undefined };
  });
}

/** saveConversation: normalize userId/user_id */
export async function saveConversation(row: ConversationRow) {
  const supabase = supabaseClient();
  const userId = (row.userId ?? row.user_id ?? 'unknown') as string;

  const payload = {
    user_id: userId,
    messages: row.messages ?? [],
    summary: row.summary ?? null,
    last_active: row.last_active ?? new Date().toISOString(),
    embedding: row.embedding ?? null,
  };

  try {
    const { data, error } = await supabase.from('conversations').insert(payload).select().single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('saveConversation error:', e);
    throw e;
  }
}

/** summarizeIfNeeded: simple heuristic (replace with LLM summarizer) */
export async function summarizeIfNeeded(conversation: ConversationRow): Promise<string | null> {
  try {
    const text = (conversation.messages ?? []).map((m: any) => `${m.role}: ${m.content}`).join('\n');
    if (text.length < 800) return null;
    return text.slice(0, 300) + (text.length > 300 ? '...' : '');
  } catch (e) {
    console.warn('summarizeIfNeeded error:', e);
    return null;
  }
}

/** writeJournal */
export async function writeJournal(userId: string, message: any, source: string | null = null) {
  const supabase = supabaseClient();
  try {
    const row = {
      user_id: userId ?? 'unknown',
      message,
      source: source ?? 'app',
    };
    const { data, error } = await supabase.from('journal').insert(row).select().single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('writeJournal error:', e);
    return null;
  }
}

/** getMemoryById */
export async function getMemoryById(memoryId: string) {
  const supabase = supabaseClient();
  try {
    const { data, error } = await supabase.from('memories').select('*').eq('id', memoryId).single();
    if (error) throw error;
    return data as MemoryRow;
  } catch (e) {
    console.warn('getMemoryById error:', e);
    return null;
  }
}

/**
 * buildPromptWithMemory
 *
 * Overloads: provide TypeScript signatures for both call styles
 */

// Overload 1: positional (preferred)
export function buildPromptWithMemory(
  userId: string,
  instruction: string,
  convoHistory?: { role: 'user' | 'assistant' | 'system'; content: string; ts?: string }[],
  memoryLimit?: number
): Promise<{ prompt: string; memories: MemoryRow[] }>;

// Overload 2: compatibility object
export function buildPromptWithMemory(opts: {
  nowInfo?: any;
  memorySummary?: string | null;
  lastAnswersForQuestions?: Record<string, { lastAnswer: string | null; lastAt?: string | null }>;
}): Promise<string>;

/** Implementation (varargs) */
export async function buildPromptWithMemory(...args: any): Promise<any> {
  // Compat object detection: single arg with nowInfo or memorySummary
  if (args.length === 1 && typeof args[0] === 'object' && (args[0].nowInfo || args[0].memorySummary)) {
    const opts = args[0] as {
      nowInfo?: any;
      memorySummary?: string | null;
      lastAnswersForQuestions?: Record<string, { lastAnswer: string | null; lastAt?: string | null }>;
    };

    const nowInfo = opts.nowInfo ?? null;
    const memorySummary = opts.memorySummary ?? null;
    const lastAnswersForQuestions = opts.lastAnswersForQuestions ?? null;

    const personaHeader = `SYSTEM: JARVIS — concise, competent, mildly witty. Use stored memory when relevant. For numeric calcs use deterministic math engine.`;

    const parts: string[] = [personaHeader];

    if (nowInfo) {
      parts.push(`TIME: ${JSON.stringify(nowInfo)}`);
    }

    parts.push('\n\n-- Memory summary --\n' + (memorySummary ? String(memorySummary) : 'No memory summary available.'));

    if (lastAnswersForQuestions) {
      const qText = Object.entries(lastAnswersForQuestions)
        .map(([k, v]) => `${k}: lastAnswer=${String(v.lastAnswer ?? 'null')} lastAt=${String(v.lastAt ?? 'null')}`)
        .join('\n');
      parts.push('\n\n-- Last answers --\n' + (qText || 'none'));
    }

    parts.push('\n\n-- Rules --\n- Always route numeric calculations to the deterministic math engine.\n- If fact is not in memory, offer to run a check.');

    const prompt = parts.join('\n\n');
    return prompt; // compat: return string
  }

  // Positional mode
  const userId: string = args[0];
  const instruction: string = args[1] ?? '';
  const convoHistory: { role: 'user' | 'assistant' | 'system'; content: string; ts?: string }[] = args[2] ?? [];
  const memoryLimit: number = typeof args[3] === 'number' ? args[3] : 6;

  // Minimal persona header (callers may also prepend full persona)
  const personaHeader = `SYSTEM: JARVIS — concise, competent, mildly witty. Use stored memory when relevant. For numeric calcs use deterministic math engine.`;

  // fetch memory rows (positional args)
  const memories = await getRelevantMemories(userId, null, null, memoryLimit);

  // map to readable memory text
  const memoryTexts = memories.map((m) => {
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
    personaHeader,
    '\n\n-- Retrieved memories (most recent first) --\n' + (memoryTexts.length ? memoryTexts.join('\n---\n') : 'No relevant memories found.'),
    '\n\n-- Recent session --\n' + (historyText || 'No recent messages.'),
    '\n\n-- User instruction --\n' + instruction,
    '\n\n-- Rules --\n- Always route numeric calculations to the deterministic math engine.\n- If fact is not in memory, ask to run a check or say you don\'t have the info.\n- Provide provenance when asserting facts (memory id or snapshot).',
  ];

  const prompt = parts.join('\n\n');
  return { prompt, memories };
}

/** Explicit default object for compatibility (default import) */
export const memoryLib = {
  embedText,
  saveMemory,
  upsertMemoryEmbedding,
  getRelevantMemories,
  fetchRelevantMemories,
  saveConversation,
  summarizeIfNeeded,
  writeJournal,
  getMemoryById,
  buildPromptWithMemory,
};

export default memoryLib;
