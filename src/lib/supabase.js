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
// Table names
// ---------------------------------------------------------------------------
const MEMORY_TABLE = "jarvis_memory";
const PROFILE_TABLE = "jarvis_profile";
const JOURNAL_TABLE = "jarvis_journal";
const RULES_TABLE = "jarvis_rules";
const PLANS_TABLE = "jarvis_plans";
const SYSTEMS_TABLE = "jarvis_systems"; // 🔥 NEW: trading / news systems

// ---------------------------------------------------------------------------
// Raw memory log (jarvis_memory)
// ---------------------------------------------------------------------------
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

export async function getMemoriesSince({
  userId,
  since,
  minImportance = 1,
  types,
}) {
  if (!supabase || !hasSupabase) return [];

  try {
    let query = supabase
      .from(MEMORY_TABLE)
      .select("*")
      .eq("user_id", userId);

    if (since) {
      query = query.gte("created_at", since);
    }
    if (minImportance != null) {
      query = query.gte("importance", minImportance);
    }
    if (Array.isArray(types) && types.length) {
      query = query.in("type", types);
    }

    query = query.order("created_at", { ascending: true });

    const { data, error } = await query;
    if (error) {
      console.error("getMemoriesSince supabase error:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("getMemoriesSince unexpected error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Auto daily journal (jarvis_journal)
// ---------------------------------------------------------------------------
export async function logJournalEntry({
  userId,
  entryDate,
  title,
  summary,
}) {
  if (!supabase || !hasSupabase) return;

  try {
    const payload = {
      user_id: userId,
      entry_date: entryDate,
      title,
      summary,
    };

    const { error } = await supabase
      .from(JOURNAL_TABLE)
      .upsert(payload, { onConflict: "user_id,entry_date" });

    if (error) {
      console.error("logJournalEntry supabase error:", error);
    }
  } catch (err) {
    console.error("logJournalEntry unexpected error:", err);
  }
}

// ---------------------------------------------------------------------------
/** Long-term profile (jarvis_profile) */
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
        // updated_at column in DB should have default now()
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

// ---------------------------------------------------------------------------
// Rules (jarvis_rules)
// ---------------------------------------------------------------------------
export async function saveRule({
  userId,
  title,
  body,
  source = "web",
  rawInput,
}) {
  if (!supabase || !hasSupabase) return;

  try {
    const { error } = await supabase.from(RULES_TABLE).insert({
      user_id: userId,
      title,
      body,
      source,
      raw_input: rawInput ?? null,
    });

    if (error) {
      console.error("saveRule supabase error:", error);
    }
  } catch (err) {
    console.error("saveRule unexpected error:", err);
  }
}

export async function listRules({ userId, limit = 50 } = {}) {
  if (!supabase || !hasSupabase) return [];

  try {
    const { data, error } = await supabase
      .from(RULES_TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("listRules supabase error:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("listRules unexpected error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Business plans (jarvis_plans)
// ---------------------------------------------------------------------------
export async function saveBusinessPlan({
  userId,
  title,
  summary,
  detail,
  source = "web",
}) {
  if (!supabase || !hasSupabase) return;

  try {
    const { error } = await supabase.from(PLANS_TABLE).insert({
      user_id: userId,
      title,
      summary,
      detail: detail ?? null,
      source,
    });

    if (error) {
      console.error("saveBusinessPlan supabase error:", error);
    }
  } catch (err) {
    console.error("saveBusinessPlan unexpected error:", err);
  }
}

export async function listBusinessPlans({ userId, limit = 50 } = {}) {
  if (!supabase || !hasSupabase) return [];

  try {
    const { data, error } = await supabase
      .from(PLANS_TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("listBusinessPlans supabase error:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("listBusinessPlans unexpected error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Trading / systems brain (jarvis_systems)
// ---------------------------------------------------------------------------

/**
 * Save a new system (e.g. trading system v1, v2, ...).
 * - Archives previous active system for this user & type.
 * - Auto-increments version number.
 */
export async function saveSystem({
  userId,
  type = "trading_system", // could also be 'news_playbook' later
  name = "Trading System",
  content,
  status = "active",
}) {
  if (!supabase || !hasSupabase)
    return { ok: false, reason: "NO_CLIENT" };
  if (!content || !content.trim()) {
    return { ok: false, reason: "EMPTY_CONTENT" };
  }

  try {
    // 1) Archive current active system (if any)
    const { error: archiveError } = await supabase
      .from(SYSTEMS_TABLE)
      .update({ status: "archived" })
      .eq("user_id", userId)
      .eq("type", type)
      .eq("status", "active");

    if (archiveError) {
      console.error("saveSystem archive error:", archiveError);
      // not fatal
    }

    // 2) Find last version
    let nextVersion = 1;
    const { data: last, error: lastErr } = await supabase
      .from(SYSTEMS_TABLE)
      .select("version")
      .eq("user_id", userId)
      .eq("type", type)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastErr && last?.version) {
      nextVersion = (last.version || 0) + 1;
    }

    // 3) Insert new system
    const { error: insertError } = await supabase
      .from(SYSTEMS_TABLE)
      .insert({
        user_id: userId,
        type,
        name,
        version: nextVersion,
        status,
        content,
      });

    if (insertError) {
      console.error("saveSystem insert error:", insertError);
      return { ok: false, reason: "INSERT_ERROR", error: insertError };
    }

    return { ok: true, version: nextVersion };
  } catch (err) {
    console.error("saveSystem unexpected error:", err);
    return { ok: false, reason: "UNEXPECTED", error: err };
  }
}

/**
 * Get active system for user & type (e.g. trading_system).
 */
export async function getActiveSystem({
  userId,
  type = "trading_system",
}) {
  if (!supabase || !hasSupabase) return null;

  try {
    const { data, error } = await supabase
      .from(SYSTEMS_TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("type", type)
      .eq("status", "active")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("getActiveSystem error:", error);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error("getActiveSystem unexpected error:", err);
    return null;
  }
}
