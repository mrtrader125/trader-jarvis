// src/lib/jarvis-memory.ts
// Unified memory helper for Jarvis.
// - Named exports: fetchMemoryForUser, fetchRelevantMemories, saveMemory
// - Default export: memoryLib { fetchMemoryForUser, fetchRelevantMemories, saveMemory }
// Handles multiple call shapes used around the codebase, including numeric args for age/limit.

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
 * or fetchMemoryForUser(userId, opts)
 */
export async function fetchMemoryForUser(
  supabaseOrUserId: ReturnType<typeof createClient> | string,
  maybeUserId?: string | { limit?: number },
  optsArg?: { limit?: number }
) {
  try {
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
 * fetchRelevantMemories:
 * Flexible signature to match calling code across the project:
 *
 * 1) fetchRelevantMemories(supabase, userId, queryOrOpts?, opts?)
 * 2) fetchRelevantMemories(userId, queryOrOpts?, opts?)
 * 3) Also supports numeric 3rd/4th args:
 *    fetchRelevantMemories(userId, null, maxAgeDays, limit)
 *
 * Behavior:
 * - If `query` is provided (string), tries text-match (ILIKE) on summary or data->>text.
 * - If `maxAgeDays` (number) is provided, filters created_at to be within that many days.
 * - `limit` controls how many rows to return.
 */
export async function fetchRelevantMemories(
  supabaseOrUserId: ReturnType<typeof createClient> | string,
  maybeUserIdOrQuery?: string | number | { query?: string; limit?: number },
  maybeQueryOrMaxAge?: string | number | { limit?: number },
  maybeOptsOrLimit?: { limit?: number } | number
) {
  try {
    // Normalize: supabase, userId, query?, maxAgeDays?, limit?
    let supabase: ReturnType<typeof createClient>;
    let userId: string;
    let query: string | undefined;
    let maxAgeDays: number | undefined;
    let limit: number | undefined;

    // Determine call pattern
    if (typeof supabaseOrUserId === "string") {
      supabase = createClient();
      userId = supabaseOrUserId;

      // maybeUserIdOrQuery can be string|null|number|opts
      if (typeof maybeUserIdOrQuery === "string") {
        query = maybeUserIdOrQuery;
      } else if (typeof maybeUserIdOrQuery === "number") {
        maxAgeDays = maybeUserIdOrQuery;
      } else if (maybeUserIdOrQuery && typeof maybeUserIdOrQuery === "object") {
        query = (maybeUserIdOrQuery as any).query;
        limit = (maybeUserIdOrQuery as any).limit;
      }

      // maybeQueryOrMaxAge could be string (query) or number (maxAgeDays) or opts
      if (typeof maybeQueryOrMaxAge === "string") {
        query = maybeQueryOrMaxAge;
      } else if (typeof maybeQueryOrMaxAge === "number") {
        maxAgeDays = maybeQueryOrMaxAge;
      } else if (maybeQueryOrMaxAge && typeof maybeQueryOrMaxAge === "object") {
        limit = (maybeQueryOrMaxAge as any).limit ?? limit;
      }

      // maybeOptsOrLimit could be opts object or numeric limit
      if (typeof maybeOptsOrLimit === "number") {
        limit = maybeOptsOrLimit;
      } else if (maybeOptsOrLimit && typeof maybeOptsOrLimit === "object") {
        limit = (maybeOptsOrLimit as any).limit ?? limit;
      }
    } else {
      // first arg is supabase client
      supabase = supabaseOrUserId;
      userId = (maybeUserIdOrQuery as string) ?? "";

      if (typeof maybeQueryOrMaxAge === "string") {
        query = maybeQueryOrMaxAge;
      } else if (typeof maybeQueryOrMaxAge === "number") {
        maxAgeDays = maybeQueryOrMaxAge;
      } else if (maybeQueryOrMaxAge && typeof maybeQueryOrMaxAge === "object") {
        query = (maybeQueryOrMaxAge as any).query ?? query;
        limit = (maybeQueryOrMaxAge as any).limit ?? limit;
      }

      if (typeof maybeOptsOrLimit === "number") {
        limit = maybeOptsOrLimit;
      } else if (maybeOptsOrLimit && typeof maybeOptsOrLimit === "object") {
        limit = (maybeOptsOrLimit as any).limit ?? limit;
      }
    }

    if (!userId) return [];

    const finalLimit = typeof limit === "number" ? limit : 10;

    // Build query builder
    let builder = supabase
      .from("jarvis_memory")
      .select("id, user_id, summary, data, importance, created_at")
      .eq("user_id", userId);

    // Apply time filter if requested
    if (typeof maxAgeDays === "number" && maxAgeDays > 0) {
      // created_at > now - maxAgeDays
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
      const iso = cutoff.toISOString();
      builder = builder.gte("created_at", iso);
    }

    // If query provided, attempt ILIKE match on summary or data->>text (Postgres JSON)
    if (query && query.trim().length) {
      // Use OR condition (summary.ilike.%query% OR data->>text.ilike.%query%)
      // Note: supabase-js uses .or() with string condition
      const orCond = `summary.ilike.%${query}%,data->>text.ilike.%${query}%`;
      builder = builder.or(orCond);
      builder = builder.order("importance", { ascending: false }).limit(finalLimit);
      const { data, error } = await builder;
      if (!error && Array.isArray(data) && data.length) return data;
      // fallthrough to other fetch if no results
    }

    // No query or no results -> fetch recent/important
    const { data, error } = await builder.order("importance", { ascending: false }).limit(finalLimit);

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
