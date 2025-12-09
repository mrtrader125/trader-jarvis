// trader-jarvis/src/lib/jarvis/tradingMemory.ts

export interface TradingProfile {
  user_id: string;
  propfirm_name?: string | null;
  account_size?: number | null;
  target_percent?: number | null;
  daily_loss_percent?: number | null;
  max_loss_percent?: number | null;
  current_profit?: number | null;
  last_updated?: string | null;
}

type SupabaseLike = any;

// ---- Load + save core trading profile -------------------------------------

export async function loadTradingProfile(
  supabase: SupabaseLike
): Promise<TradingProfile | null> {
  try {
    const { data, error } = await supabase
      .from("jarvis_trading_profile")
      .select("*")
      .eq("user_id", "single-user")
      .single();

    if (error) {
      console.error("Error loading jarvis_trading_profile:", error.message);
      return null;
    }

    return data as TradingProfile;
  } catch (err) {
    console.error("Exception loading jarvis_trading_profile:", err);
    return null;
  }
}

export async function upsertTradingProfile(
  supabase: SupabaseLike,
  patch: Partial<TradingProfile>
) {
  const data = {
    user_id: "single-user",
    ...patch,
    last_updated: new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from("jarvis_trading_profile")
      .upsert(data);

    if (error) {
      console.error("Error upserting jarvis_trading_profile:", error.message);
    }
  } catch (err) {
    console.error("Exception upserting jarvis_trading_profile:", err);
  }
}

// ---- Small helpers for parsing numbers from text ---------------------------

function findPercents(text: string): number[] {
  const out: number[] = [];
  const regex = /(-?\d+(\.\d+)?)\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    out.push(parseFloat(m[1]));
  }
  return out;
}

function findBigNumber(text: string): number | null {
  const m = text.match(/(\d{3,})(?:\.\d+)?/);
  if (!m) return null;
  return parseFloat(m[1]);
}

// ---- Auto-update trading memory from what you say -------------------------

export async function autoUpdateTradingMemoryFromUtterance(
  supabase: SupabaseLike,
  text: string | undefined | null
) {
  if (!text) return;
  const raw = text;
  const lower = raw.toLowerCase();
  if (!raw.trim()) return;

  const percents = findPercents(raw);
  const patch: Partial<TradingProfile> = {};

  // Daily + max loss in one sentence: "daily is 3% and max loss is 12%"
  if (
    lower.includes("daily") &&
    lower.includes("loss") &&
    (lower.includes("max") || lower.includes("overall"))
  ) {
    if (percents[0] != null) patch.daily_loss_percent = percents[0];
    if (percents[1] != null) patch.max_loss_percent = percents[1];
  } else {
    // Single daily loss definition
    if (lower.includes("daily") && lower.includes("loss") && percents[0] != null) {
      patch.daily_loss_percent = percents[0];
    }

    // Single max loss definition
    if (
      (lower.includes("max loss") ||
        lower.includes("max-loss") ||
        lower.includes("maxloss")) &&
      percents[0] != null
    ) {
      patch.max_loss_percent = percents[0];
    }
  }

  // Target percent
  if (
    lower.includes("target") &&
    (lower.includes("%") || lower.includes("percent")) &&
    percents[0] != null
  ) {
    patch.target_percent = percents[0];
  }

  // Account size
  if (
    lower.includes("account") &&
    (lower.includes("size") ||
      lower.includes("propfirm") ||
      lower.includes("prop firm") ||
      lower.includes("funded") ||
      lower.includes("evaluation"))
  ) {
    const num = findBigNumber(raw);
    if (num != null) patch.account_size = num;
  }

  // Prop firm name (simple heuristic)
  if (lower.includes("funded elite")) {
    patch.propfirm_name = "Funded Elite";
  }

  // Current profit (only if there's a big number and we mention profit)
  if (lower.includes("profit") && !lower.includes("%")) {
    const num = findBigNumber(raw);
    if (num != null) patch.current_profit = num;
  }

  if (Object.keys(patch).length === 0) return;

  await upsertTradingProfile(supabase, patch);
}

// ---- Build snippet for system prompt --------------------------------------

export function buildTradingProfileSnippet(
  profile: TradingProfile | null
): string {
  if (!profile) {
    return `
[Trading profile memory]
- No stored prop firm settings yet. When the user tells you about account size,
  targets, or loss limits, treat those as persistent and use them later.
`.trim();
  }

  return `
[Trading profile memory]
- Prop firm: ${profile.propfirm_name ?? "not set"}
- Account size: ${profile.account_size ?? "not set"}
- Target percent: ${
    profile.target_percent != null ? profile.target_percent + "%" : "not set"
  }
- Daily loss limit: ${
    profile.daily_loss_percent != null ? profile.daily_loss_percent + "%" : "not set"
  }
- Max loss limit: ${
    profile.max_loss_percent != null ? profile.max_loss_percent + "%" : "not set"
  }
- Last known profit: ${profile.current_profit ?? "not set"}
`.trim();
}
