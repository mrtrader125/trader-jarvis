import { createClient } from "@/lib/supabase/server";

export async function loadTradingProfile() {
  const supabase = createClient();
  const { data } = await supabase
    .from("jarvis_trading_profile")
    .select("*")
    .eq("user_id", "single-user")
    .maybeSingle();
  return data;
}

export async function updateTradingProfile(fields: any) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("jarvis_trading_profile")
    .upsert({
      user_id: "single-user",
      ...fields,
      last_updated: new Date().toISOString()
    });

  if (error) {
    console.error("Failed to update trading profile:", error.message);
  }

  return data;
}
