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
// Long-term profile (jarvis_profile)
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
