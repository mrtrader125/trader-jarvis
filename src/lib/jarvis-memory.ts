// src/lib/jarvis-memory.ts
/**
 * jarvis-memory.ts
 *
 * Lightweight Supabase-based memory helpers for Jarvis.
 * - Provides getRelevantMemories (supports signature used in summarizer)
 * - Provides saveConversation, writeJournal, saveMemory, upsertMemoryEmbedding, embedText stub
 * - Exports fetchRelevantMemories as an alias for backwards compatibility
 *
 * NOTE: This file is intentionally dependency-light and uses the project's
 * Supabase server client factory at "@/lib/supabase/server".
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
  // Accept both naming styles so callers using camelCase or snake_case work.
  userId?: string;
  user_id?: string;
  messages: any[];
  summary?: string;
  last_active?: string;
  embedding?: any;
  created_at?: string;
  updated_at?: string;
};

// Helper to get Supabase server client (wrap to keep portability)
function supabaseClient() {
  return createClient();
}

/**
 * embedText
 * - Placeholder embedding function. Replace with your embedding provider call.
 * - Returns a vector (array of numbers) or null if embedding not available.
 */
export async function embedText(text: string): Promise<number[] | null> {
  // Placeholder: if you have an embeddings provider, call it here and return vector.
  // e.g., call OpenAI/your-embed-service and return vector numbers.
  // For now, return null to indicate embeddings are not present.
  try {
    if (!text) return null;
    // Minimal deterministic fallback: hash characters to small vector (not for real similarity)
    const v = new Array(8).fill(0).map((_, i) => (text.charCodeAt(i % text.length) || 0) % 100 / 100);
    return v;
  } catch (e) {
    console.warn('embedText fallback failed:', e);
    return null;
  }
}

/**
 * saveMemory
 * Insert a memory row into 'memories' table (or update if id provided).
 */
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

/**
 * upsertMemoryEmbedding
 * Update a memory row with embedding vector (assumes memory row id exists).
 */
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
 * Returns recent relevant memories for a user.
 *
 * Signature supports:
 *  - userId: string
 *  - tagFilter?: string[] | null
 *  - daysRange?: number | null  (number of days to look back; if null -> no time filter)
 *  - limit?: number (max rows to return)
 *
 * This implementation uses simple filters (tags contains & created_at >= since).
 */
export async function getRelevantMemories(
  userId: string,
  tagFilter: string[] | null = null,
  daysRange: number | null = null,
  limit: number = 50
): Promise<MemoryRow[]> {
  const supabase = supabaseClient();

  try {
    let query = supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (tagFilter && Array.isArray(tagFilter) && tagFilter.length > 0) {
      // uses Postgres array/JSON contains; adjust if your schema differs
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

// Backwards-compatible alias expected by older code
export const fetchRelevantMemories = getRelevantMemories;

/**
 * saveConversation
 * Save a conversation snapshot to conversations table.
 * Accepts either `userId` (camelCase) or `user_id` (snake_case) and normalizes to `user_id`.
 */
export async function saveConversation(row: ConversationRow) {
  const supabase = supabaseClient();

  // Normalize user id from either camelCase or snake_case
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

/**
 * summarizeIfNeeded
 * Placeholder summarizer: produces a short summary if messages exceed threshold.
 * Replace with real LLM summarization or retriever as needed.
 */
export async function summarizeIfNeeded(conversation: ConversationRow): Promise<string | null> {
  try {
    const text = (conversation.messages ?? []).map((m: any) => `${m.role}: ${m.content}`).join('\n');
    if (text.length < 800) return null;
    // Very small heuristic summary (first 300 chars)
    return text.slice(0, 300) + (text.length > 300 ? '...' : '');
  } catch (e) {
    console.warn('summarizeIfNeeded error:', e);
    return null;
  }
}

/**
 * writeJournal
 * Write an audit log to the `journal` table.
 */
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

/**
 * Utility: getMemoryById
 */
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

// Default export for compatibility with earlier code that expects default object
export default {
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
