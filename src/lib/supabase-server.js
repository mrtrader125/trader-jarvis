// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// We support both public + service keys.
// For server-side stuff (API routes) the SERVICE_ROLE key is preferred.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      })
    : null;

export const hasSupabase = !!supabase;

// ---- Memory helpers -------------------------------------------------

const DEFAULT_USER_ID = "default-user";

/**
 * Log one memory row into jarvis_memory.
 * Safe: if Supabase is not configured, this just silently returns.
 */
export async function logMemory({
  userId = DEFAULT_USER_ID,
  role,
  content,
  type = "chat",
  meta = null,
}) {
  if (!supabase) return;

  try {
    await supabase.from("jarvis_memory").insert([
      {
        user_id: userId,
        role,
        content,
        type,
        meta,
      },
    ]);
  } catch (err) {
    console.error("Supabase logMemory error:", err?.message || err);
  }
}

/**
 * Get recent raw memories for a user (for context in prompts).
 */
export async function getRecentMemories({
  userId = DEFAULT_USER_ID,
  limit = 25,
}) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("jarvis_memory")
      .select("role, content, type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Supabase getRecentMemories error:", error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Supabase getRecentMemories exception:", err?.message || err);
    return [];
  }
}

// ---- Long-term profile summary --------------------------------------

/**
 * Get the long-term personality / trading profile summary for a user.
 */
export async function getUserProfileSummary(userId = DEFAULT_USER_ID) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("jarvis_profile")
      .select("summary")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found
      console.error("Supabase getUserProfileSummary error:", error.message);
      return null;
    }

    return data?.summary || null;
  } catch (err) {
    console.error(
      "Supabase getUserProfileSummary exception:",
      err?.message || err
    );
    return null;
  }
}

/**
 * Upsert the long-term profile summary.
 */
export async function upsertUserProfileSummary(
  summary,
  userId = DEFAULT_USER_ID
) {
  if (!supabase) return;

  try {
    const { error } = await supabase.from("jarvis_profile").upsert(
      {
        user_id: userId,
        summary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Supabase upsertUserProfileSummary error:", error.message);
    }
  } catch (err) {
    console.error(
      "Supabase upsertUserProfileSummary exception:",
      err?.message || err
    );
  }
}
