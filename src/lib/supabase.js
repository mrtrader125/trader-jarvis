// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Basic client
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasSupabase = !!supabaseUrl && !!supabaseServiceKey;

export const supabase = hasSupabase
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    })
  : null;

// ---------------------------------------------------------------------------
// Helpers: memory table (jarvis_memory)
// columns: id (uuid, default), user_id text, channel text, type text,
//          content text, importance int2, created_at timestamptz default now()
// ---------------------------------------------------------------------------

const MEMORY_TABLE = "jarvis_memory";
const PROFILE_TABLE = "jarvis_profile";

export async function logMemory({
  userId,
  channel = "web",
  type = "chat",
  content,
  importance = 1,
}) {
  if (!supabase || !hasSupabase) return;

  try {
    const { error } = await supabase.from(MEMORY_TABLE).insert({
      user_id: userId,
      channel,
      type,
      content,
      importance,
    });

    if (error) {
      console.error("logMemory supabase error:", error);
    }
  } catch (err) {
    console.error("logMemory unexpected error:", err);
  }
}

export async function getRecentMemories({
  userId,
  limit = 30,
  minImportance = 1,
}) {
  if (!supabase || !hasSupabase) return [];

  try {
    const { data, error } = await supabase
      .from(MEMORY_TABLE)
      .select("*")
      .eq("user_id", userId)
      .gte("importance", minImportance)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("getRecentMemories supabase error:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("getRecentMemories unexpected error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers: long-term profile table (jarvis_profile)
// columns: user_id text PK, summary text, updated_at timestamptz default now()
// ---------------------------------------------------------------------------

export async function getUserProfileSummary(userId) {
  if (!supabase || !hasSupabase) return null;

  try {
    const { data, error } = await supabase
      .from(PROFILE_TABLE)
      .select("summary")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("getUserProfileSummary error:", error);
      return null;
    }

    return data?.summary ?? null;
  } catch (err) {
    console.error("getUserProfileSummary unexpected error:", err);
    return null;
  }
}

export async function upsertUserProfileSummary(summary, userId) {
  if (!supabase || !hasSupabase) return;

  try {
    const { error } = await supabase.from(PROFILE_TABLE).upsert(
      {
        user_id: userId,
        summary,
        // updated_at will auto-default to now() if you set default in schema
      },
      {
        onConflict: "user_id",
      }
    );

    if (error) {
      console.error("upsertUserProfileSummary error:", error);
    }
  } catch (err) {
    console.error("upsertUserProfileSummary unexpected error:", err);
  }
}
