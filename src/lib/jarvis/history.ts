// trader-jarvis/src/lib/jarvis/history.ts

export type HistoryChannel = "web" | "telegram";
export type HistoryRole = "user" | "assistant";

type SupabaseLike = any; // avoid tight typing, works with your server client

export async function loadRecentHistory(opts: {
  supabase: SupabaseLike;
  userId?: string;
  limit?: number;
  channels?: HistoryChannel[];
}): Promise<{ role: HistoryRole; content: string }[]> {
  const { supabase, userId = "single-user", limit = 10, channels } = opts;

  try {
    let query = supabase
      .from("jarvis_history")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (channels && channels.length > 0) {
      query = query.in("channel", channels);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error loading jarvis_history:", error.message);
      return [];
    }

    if (!data) return [];

    // reverse so earliest first
    return data
      .slice()
      .reverse()
      .map((row: any) => ({
        role: row.role as HistoryRole,
        content: row.content as string,
      }));
  } catch (err) {
    console.error("Exception loading jarvis_history:", err);
    return [];
  }
}

export async function saveHistoryPair(opts: {
  supabase: SupabaseLike;
  channel: HistoryChannel;
  userId?: string;
  userText?: string | null;
  assistantText?: string | null;
}) {
  const {
    supabase,
    channel,
    userId = "single-user",
    userText,
    assistantText,
  } = opts;

  const rows: any[] = [];

  if (userText && userText.trim().length > 0) {
    rows.push({
      user_id: userId,
      channel,
      role: "user",
      content: userText,
    });
  }

  if (assistantText && assistantText.trim().length > 0) {
    rows.push({
      user_id: userId,
      channel,
      role: "assistant",
      content: assistantText,
    });
  }

  if (rows.length === 0) return;

  try {
    const { error } = await supabase.from("jarvis_history").insert(rows);
    if (error) {
      console.error("Error saving jarvis_history:", error.message);
    }
  } catch (err) {
    console.error("Exception saving jarvis_history:", err);
  }
}