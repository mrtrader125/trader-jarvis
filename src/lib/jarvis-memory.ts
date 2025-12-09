// src/lib/jarvis-memory.ts
// Unified memory helper for Jarvis.
// - Named exports: fetchMemoryForUser, fetchRelevantMemories, saveMemory
// - Default export: memoryLib { fetchMemoryForUser, fetchRelevantMemories, saveMemory }
// This satisfies modules that import either named functions or a default memoryLib.

// NOTE: This module is server-side only. It uses Supabase server client.

import { createClient } from "./supabase/server";

export type MemoryRow = {
  id?: string;
  user_id: string;
  summary: string;
  data?: any;
  importance?: number;
  created_at?: string;
};

/**
 * fetchMemoryForUser(supabase, userId, opts)
 * - returns the most relevant memory rows for a user (simple importance order).
 * - If supabase client is omitted (null), it will create one internally.
 */
export async function fetchMemoryForUser(
  supabaseOrUserId: ReturnType<typeof createClient> | string,
  maybeUserId?: string | { limit?: number },
  optsArg?: { limit?: number }
) {
  try {
    // allow flexible call sign: (supabase, userId, opts) OR (userId, opts)
    let supabase: ReturnType<typeof createClient>;
    let userId: string;
    let opts: { limit?: number } | undefined;

    if (typeof supabaseOrUserId === "string") {
      supabase = createClient();
      userId = supabaseOrUserId;
      opts = maybeUserId as { limit?: number } | undefined;
    } else {
      supabase = supabaseOrUserId;
      userId = (maybeUserId as string) ?? "";
      opts = optsArg;
    }

    if (!userId) return [];

    const limit = opts?.limit ?? 6;
    const { data, error } = await supabase
      .from("jarvis_memory")
      .select("id, user_id, summary, data, importance, created_at")
      .eq("user_id", userId)
      .order("importance", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("fetchMemoryForUser supabase error:", error);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.warn("fetchMemoryForUser failed", e);
    return [];
  }
}

/**
 * fetchRelevantMemories(supabase, userId, query, opts)
 * - used by summarizer jobs to find memories relevant to a query.
 * - Implements a simple text-match-based relevance (SQL ILIKE) fallback if no vector search.
 */
export async function fetchRelevantMemories(
  supabaseOrUserId: ReturnType<typeof createClient> | string,
  maybeUserIdOrQuery?: string | { query?: string; limit?: number },
  maybeQueryOrOpts?: string | { limit?: number },
  optsArg?: { limit?: number }
) {
  try {
    // normalize args to (supabase, userId, query, opts)
    let supabase: ReturnType<typeof createClient>;
    let userId: string;
    let query: string | undefined;
    let opts: { limit?: number } | undefined;

    if (typeof supabaseOrUserId === "string") {
      supabase = createClient();
      userId = supabaseOrUserId;
      if (typeof maybeUserIdOrQuery === "string") {
        query = maybeUserIdOrQuery;
        opts = maybeQueryOrOpts as { limit?: number } | undefined;
      } else {
        query = maybeUserIdOrQuery?.query;
        opts = maybeUserIdOrQuery as { limit?: number } | undefined;
      }
    } else {
      supabase = supabaseOrUserId;
      userId = (maybeUserIdOrQuery as string) ?? "";
      query = (maybeQueryOrOpts as string) ?? undefined;
      opts = optsArg;
    }

    if (!userId) return [];

    const limit = opts?.limit ?? 10;

    if (query && query.trim().length) {
      // simple text match fallback using ILIKE on summary or json data
      const { data, error } = await supabase
        .from("jarvis_memory")
        .select("id, user_id, summary, data, importance, created_at")
        .eq("user_id", userId)
        .or(`summary.ilike.%${query}%,data->>text.ilike.%${query}%`)
        .order("importance", { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data) && data.length) return data;
      // if no results, fallthrough to generic fetch
    }

    // generic fetch (recent + important)
    const { data, error } = await supabase
      .from("jarvis_memory")
      .select("id, user_id, summary, data, importance, created_at")
      .eq("user_id", userId)
      .order("importance", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("fetchRelevantMemories supabase error:", error);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.warn("fetchRelevantMemories failed", e);
    return [];
  }
}

/**
 * saveMemory(userId, payload)
 * - project expects this signature in many places.
 */
export async function saveMemory(userId: string, payload: { summary: string; data?: any; importance?: number }) {
  try {
    const supabase = createClient();
    const row: MemoryRow = {
      user_id: userId,
      summary: payload.summary,
      data: payload.data ?? {},
      importance: payload.importance ?? 1,
    };
    const { error } = await supabase.from("jarvis_memory").insert([row]);
    if (error) {
      console.warn("saveMemory insert error", error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("saveMemory failed", e);
    return false;
  }
}

// default export expected by some modules
const memoryLib = {
  fetchMemoryForUser,
  fetchRelevantMemories,
  saveMemory,
};

export default memoryLib;
