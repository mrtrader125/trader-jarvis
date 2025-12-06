import { createClient } from "@supabase/supabase-js";

let supabase = null;

export function getSupabaseServerClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Supabase env vars missing");
    }

    supabase = createClient(url, key, {
      auth: {
        persistSession: false,
      },
    });
  }
  return supabase;
}
