// src/lib/jarvis-memory.ts
/**
 * jarvis-memory.ts
 *
 * Exports:
 *  - named exports: embedText, saveMemory, upsertMemoryEmbedding, getRelevantMemories,
 *    fetchRelevantMemories, saveConversation, summarizeIfNeeded, writeJournal, getMemoryById
 *  - default export: memoryLib (object with the same functions) for modules that import default
 *
 * Uses Supabase server client at "@/lib/supabase/server".
 */

import { createClient } from '@/lib/supabase/server';

// Types
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

/** embedText: placeholder embedding - returns small deterministic vector or null */
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
 * getRelevantMemories
 * Return MemoryRow[] filtered by userId, optional tagFilter, optional daysRange (days), and limit
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
 * fetchRelevantMemories (compatibility wrapper)
 * Returns items shaped for summarizer: { id?, text: string, type?: string }[]
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

/** saveConversation: normalize userId/user_id and persist */
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

/** summarizeIfNeeded */
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
 * Build explicit default object to satisfy default imports (and keep parity with named exports)
 */
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
};

// Named exports already provided above; ensure default export exists too
export default memoryLib;
