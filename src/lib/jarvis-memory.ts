// src/lib/jarvis-memory.ts
// Minimal memory helpers for Jarvis: fetchMemoryForUser and saveMemory.
// Uses Supabase server client (server-side only).

import { createClient } from "./supabase/server";

export type MemoryRow = {
  id?: string;
  user_id: string;
  summary: string;
  data?: any;
  importance?: number;
  created_at?: string;
};

export async function fetchMemoryForUser(supabase: ReturnType<typeof createClient>, userId: string, opts?: { limit?: number }) {
  try {
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

// Save a single memory item. Project expects signature saveMemory(userId, payload)
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
