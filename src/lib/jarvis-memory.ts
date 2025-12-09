// src/lib/jarvis-memory.ts
// Unified memory helper for Jarvis.
// - Named exports: fetchMemoryForUser, fetchRelevantMemories, saveMemory, saveConversation, writeJournal
// - Default export: memoryLib { ... }
// Server-only helpers using Supabase server client.

import { createClient } from "./supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MemoryRow = {
  id?: string;
  user_id: string;
  summary: string;
  data?: any;
  importance?: number;
  created_at?: string;
};

export type ConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  ts?: string;
};

/* -------------------------
   Basic memory functions
   ------------------------- */

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

/* -------------------------
   Flexible relevant-memory fetcher
   ------------------------- */

export async function fetchRelevantMemories(
  supabaseOrUserId: ReturnType<typeof createClient> | string,
  maybeUserIdOrQuery?: string | number | { query?: string; limit?: number },
  maybeQueryOrMaxAge?: string | number | { limit?: number },
  maybeOptsOrLimit?: { limit?: number } | number
) {
  try {
    let supabase: ReturnType<typeof createClient>;
    let userId: string;
    let query: string | undefined;
    let maxAgeDays: number | undefined;
    let limit: number | undefined;

    if (typeof supabaseOrUserId === "string") {
      supabase = createClient();
      userId = supabaseOrUserId;

      if (typeof maybeUserIdOrQuery === "string") query = maybeUserIdOrQuery;
      else if (typeof maybeUserIdOrQuery === "number") maxAgeDays = maybeUserIdOrQuery;
      else if (maybeUserIdOrQuery && typeof maybeUserIdOrQuery === "object") {
        query = (maybeUserIdOrQuery as any).query;
        limit = (maybeUserIdOrQuery as any).limit;
      }

      if (typeof maybeQueryOrMaxAge === "string") query = maybeQueryOrMaxAge;
      else if (typeof maybeQueryOrMaxAge === "number") maxAgeDays = maybeQueryOrMaxAge;
      else if (maybeQueryOrMaxAge && typeof maybeQueryOrMaxAge === "object") {
        limit = (maybeQueryOrMaxAge as any).limit ?? limit;
      }

      if (typeof maybeOptsOrLimit === "number") limit = maybeOptsOrLimit;
      else if (maybeOptsOrLimit && typeof maybeOptsOrLimit === "object") {
        limit = (maybeOptsOrLimit as any).limit ?? limit;
      }
    } else {
      supabase = supabaseOrUserId;
      userId = (maybeUserIdOrQuery as string) ?? "";

      if (typeof maybeQueryOrMaxAge === "string") query = maybeQueryOrMaxAge;
      else if (typeof maybeQueryOrMaxAge === "number") maxAgeDays = maybeQueryOrMaxAge;
      else if (maybeQueryOrMaxAge && typeof maybeQueryOrMaxAge === "object") {
        query = (maybeQueryOrMaxAge as any).query;
        limit = (maybeQueryOrMaxAge as any).limit ?? limit;
      }

      if (typeof maybeOptsOrLimit === "number") limit = maybeOptsOrLimit;
      else if (maybeOptsOrLimit && typeof maybeOptsOrLimit === "object") {
        limit = (maybeOptsOrLimit as any).limit ?? limit;
      }
    }

    if (!userId) return [];

    const finalLimit = typeof limit === "number" ? limit : 10;
    let builder = supabase
      .from("jarvis_memory")
      .select("id, user_id, summary, data, importance, created_at")
      .eq("user_id", userId);

    if (typeof maxAgeDays === "number" && maxAgeDays > 0) {
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
      builder = builder.gte("created_at", cutoff.toISOString());
    }

    if (query && query.trim().length) {
      const orCond = `summary.ilike.%${query}%,data->>text.ilike.%${query}%`;
      builder = builder.or(orCond);
      builder = builder.order("importance", { ascending: false }).limit(finalLimit);
      const { data, error } = await builder;
      if (!error && Array.isArray(data) && data.length) return data;
    }

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

/* -------------------------
   saveMemory
   ------------------------- */

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

/* -------------------------
   saveConversation
   ------------------------- */

export async function saveConversation(payload: {
  userId: string;
  messages: ConversationMessage[];
  summary?: string;
  meta?: any;
}) {
  try {
    const supabase = createClient();
    const row = {
      user_id: payload.userId,
      messages: payload.messages,
      summary: payload.summary ?? null,
      meta: payload.meta ?? {},
      created_at: new Date().toISOString(),
    };

    let res = await supabase.from("conversations").insert([row]);
    if (res.error) {
      console.warn("saveConversation: insert to 'conversations' failed, trying 'jarvis_conversations'", res.error);
      const res2 = await supabase.from("jarvis_conversations").insert([row]);
      if (res2.error) {
        console.warn("saveConversation: fallback insert failed", res2.error);
        return false;
      }
      return true;
    }
    return true;
  } catch (e) {
    console.warn("saveConversation failed", e);
    return false;
  }
}

/* -------------------------
   writeJournal
   ------------------------- */

export async function writeJournal(userId: string, payload: any, source?: string) {
  try {
    const supabase = createClient();
    const row = {
      user_id: userId,
      event: payload?.event ?? payload?.type ?? "event",
      payload,
      source: source ?? null,
      created_at: new Date().toISOString(),
    };

    // Primary table name 'journal'
    let res = await supabase.from("journal").insert([row]);
    if (res.error) {
      // fallback to 'jarvis_journal'
      console.warn("writeJournal: insert to 'journal' failed, trying 'jarvis_journal'", res.error);
      const res2 = await supabase.from("jarvis_journal").insert([row]);
      if (res2.error) {
        console.warn("writeJournal: fallback insert failed", res2.error);
        return false;
      }
      return true;
    }
    return true;
  } catch (e) {
    console.warn("writeJournal failed", e);
    return false;
  }
}

/* -------------------------
   default export object
   ------------------------- */

const memoryLib = {
  fetchMemoryForUser,
  fetchRelevantMemories,
  saveMemory,
  saveConversation,
  writeJournal,
};

export default memoryLib;
