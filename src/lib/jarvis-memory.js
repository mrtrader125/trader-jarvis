import { getSupabaseServerClient } from "./supabase-server";

export async function loadLongTermMemory(userId) {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("jarvis_memory")
    .select("memory")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("loadLongTermMemory error:", error);
    return {};
  }
  return data?.memory || {};
}

export async function saveLongTermMemory(userId, memory) {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("jarvis_memory")
    .upsert(
      {
        user_id: userId,
        memory,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("saveLongTermMemory error:", error);
  }
}
