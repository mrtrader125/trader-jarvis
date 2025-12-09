// src/lib/jarvis-memory.ts
// Memory engine using Groq embeddings by default.
// Full replacement — drop into src/lib and replace previous file.

import { createClient } from '@/lib/supabase/server';
import { groqClient } from '@/lib/groq';

const supabase = createClient();

type MemoryType = 'rule' | 'preference' | 'fact' | 'event' | 'trade_snapshot' | 'note';

export interface JarvisMemory {
  id?: string;
  user_id: string;
  type: MemoryType;
  title: string;
  content: any;
  embedding?: number[] | null;
  importance?: number;
  tags?: string[];
  status?: 'active' | 'archived';
  created_at?: string;
  updated_at?: string;
}

/**
 * embedText: uses groqClient.embed(...) to produce embedding vectors.
 * - Model name here is 'embed-1536' as placeholder; change if your Groq account uses another name.
 * - The function returns a number[] embedding suitable for storing in Supabase vector column.
 */
export async function embedText(text: string): Promise<number[]> {
  if (!text || !text.trim()) throw new Error('embedText: empty text');

  // Primary: use groqClient.embed if available
  try {
    if (!groqClient || typeof (groqClient as any).embed !== 'function') {
      throw new Error('groqClient.embed not available');
    }

    const resp = await (groqClient as any).embed({
      model: 'embed-1536', // change if your Groq embedding model name differs
      input: text,
    });

    // Common response shapes handled:
    // - { data: [{ embedding: [...] }, ...] }
    // - { embedding: [...] }
    if (resp?.data && Array.isArray(resp.data) && resp.data[0]?.embedding) {
      return resp.data[0].embedding;
    }
    if (Array.isArray(resp) && resp[0]?.embedding) {
      return resp[0].embedding;
    }
    if (resp?.embedding) {
      return resp.embedding;
    }

    throw new Error('embed response missing embedding');
  } catch (err: any) {
    console.error('embedText (groq) failed:', err?.message ?? err);
    throw new Error('Embedding failed (groq). Check groqClient and model name.');
  }
}

/**
 * extractTextFromContent: Pulls readable text from JSON content for embedding generation.
 * Keeps input sizes reasonable by trimming to 8192 chars.
 */
export function extractTextFromContent(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content.slice(0, 8192);
  try {
    const strings: string[] = [];
    const stack: any[] = [content];

    while (stack.length) {
      const cur = stack.pop();
      if (!cur) continue;
      if (typeof cur === 'string') {
        strings.push(cur);
        continue;
      }
      if (Array.isArray(cur)) {
        for (let i = cur.length - 1; i >= 0; --i) stack.push(cur[i]);
        continue;
      }
      if (typeof cur === 'object') {
        for (const k of Object.keys(cur)) {
          const v = cur[k];
          if (typeof v === 'string') strings.push(v);
          else stack.push(v);
        }
      }
      if (strings.join(' ').length > 8000) break;
    }

    const joined = strings.join(' ').replace(/\s+/g, ' ').trim();
    return joined.slice(0, 8192);
  } catch (e) {
    return JSON.stringify(content).slice(0, 8192);
  }
}

/**
 * saveMemory: inserts a memory into the memories table.
 * - will compute embedding using Groq if not provided.
 * - returns inserted row on success.
 */
export async function saveMemory(mem: JarvisMemory) {
  try {
    const contentText = extractTextFromContent(mem.content);
    const embedding = mem.embedding ?? (contentText ? await embedText(contentText) : null);

    const row = {
      user_id: mem.user_id,
      type: mem.type,
      title: mem.title,
      content: mem.content,
      embedding: embedding ?? null,
      importance: mem.importance ?? 1,
      tags: mem.tags ?? [],
      status: mem.status ?? 'active',
    };

    const { data, error } = await supabase.from('memories').insert(row).select().single();
    if (error) {
      console.error('saveMemory supabase error:', error);
      return { error };
    }
    return { data };
  } catch (err) {
    console.error('saveMemory exception:', err);
    return { error: err };
  }
}

/**
 * upsertMemoryEmbedding: update embedding for an existing memory id.
 */
export async function upsertMemoryEmbedding(memoryId: string, embedding: number[]) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .update({ embedding })
      .eq('id', memoryId)
      .select()
      .single();
    if (error) {
      console.error('upsertMemoryEmbedding error:', error);
      return { error };
    }
    return { data };
  } catch (err) {
    console.error('upsertMemoryEmbedding exception:', err);
    return { error: err };
  }
}

/**
 * getRelevantMemories: uses RPC match_memories if embedding provided or can be created.
 * - Accepts userId and either queryEmbedding or queryText.
 * - Falls back to a simple textual search if embedding or RPC fails.
 */
export async function getRelevantMemories({
  userId,
  queryText,
  queryEmbedding,
  limit = 6,
}: {
  userId: string;
  queryText?: string;
  queryEmbedding?: number[] | null;
  limit?: number;
}) {
  try {
    // If caller provided embedding, prefer RPC
    if (queryEmbedding && Array.isArray(queryEmbedding) && queryEmbedding.length > 0) {
      const { data, error } = await supabase
        .rpc('match_memories', { p_user_id: userId, p_query_embedding: queryEmbedding, p_limit: limit });
      if (!error && data) return { data };
      console.warn('match_memories RPC returned error:', error);
    }

    // If queryText exists, generate embedding via Groq and call RPC
    if (queryText && queryText.trim()) {
      try {
        const emb = await embedText(queryText);
        const { data, error } = await supabase
          .rpc('match_memories', { p_user_id: userId, p_query_embedding: emb, p_limit: limit });
        if (!error && data) return { data };
        console.warn('match_memories after emb error:', error);
      } catch (e) {
        console.warn('embedding for search failed:', (e as Error).message ?? e);
      }
    }

    // final fallback: text search on title/content
    if (queryText && queryText.trim()) {
      const { data, error } = await supabase
        .from('memories')
        .select('id, title, content, importance, tags, created_at, updated_at')
        .ilike('title', `%${queryText}%`)
        .or(`content::text.ilike.%${queryText}%`)
        .limit(limit);
      if (!error && data) return { data };
      console.warn('fallback text search error:', error);
      return { data: [] };
    }

    // default: return recent high importance memories for user
    const { data, error } = await supabase
      .from('memories')
      .select('id, title, content, importance, tags, created_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('importance', { ascending: false })
      .limit(limit);
    if (!error && data) return { data };
    return { data: [] };
  } catch (err) {
    console.error('getRelevantMemories exception:', err);
    return { error: err };
  }
}

/**
 * saveConversation: store session-level conversation snapshots
 * - attempts to embed summary/messages when possible
 */
export async function saveConversation({
  userId,
  messages,
  summary,
  embedding,
}: {
  userId: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string; ts?: string }[];
  summary?: string;
  embedding?: number[] | null;
}) {
  try {
    const summaryText = summary ?? messages.map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 8000);
    const emb = embedding ?? (summaryText ? await embedText(summaryText) : null);

    const row = {
      user_id: userId,
      messages,
      summary: summaryText,
      embedding: emb ?? null,
      last_active: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('conversations').insert(row).select().single();
    if (error) {
      console.error('saveConversation error:', error);
      return { error };
    }
    return { data };
  } catch (err) {
    console.error('saveConversation exception:', err);
    return { error: err };
  }
}

/**
 * summarizeIfNeeded: light wrapper using Groq to summarize long text; fallback to truncation
 */
export async function summarizeIfNeeded(text: string, maxLen = 800) {
  if (!text || text.length <= maxLen) return text;
  try {
    if (groqClient && typeof (groqClient as any).complete === 'function') {
      const prompt = `Summarize the following text into 1-3 concise sentences, keeping facts and timestamps:\n\n${text}`;
      const resp = await (groqClient as any).complete({
        prompt,
        temperature: 0.0,
        max_tokens: 200,
      });
      const summary = resp?.choices?.[0]?.text ?? resp?.output ?? null;
      if (summary) return String(summary).trim().slice(0, maxLen);
    }
  } catch (e) {
    console.warn('summarizeIfNeeded groq failed:', (e as Error).message ?? e);
  }
  return text.slice(0, maxLen) + '...';
}

/** Simple journal write helper */
export async function writeJournal(userId: string, message: any, source = 'jarvis-memory') {
  try {
    const { data, error } = await supabase.from('journal').insert({ user_id: userId, message, source }).select().single();
    if (error) console.warn('writeJournal error:', error);
    return { data, error };
  } catch (e) {
    console.error('writeJournal exception:', e);
    return { error: e };
  }
}

// Add compatibility alias for older imports that expect fetchRelevantMemories
export const fetchRelevantMemories = getRelevantMemories;

// also keep default export (if present)
export default {
  embedText,
  extractTextFromContent,
  saveMemory,
  upsertMemoryEmbedding,
  getRelevantMemories,
  fetchRelevantMemories, // alias included
  saveConversation,
  summarizeIfNeeded,
  writeJournal,
};
