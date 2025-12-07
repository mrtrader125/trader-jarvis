// src/lib/supabase-server.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// We keep a single instance in memory on the server
let supabaseServerClient = null;

export function getSupabaseServerClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    // Safe: we just don't use memory if not configured
    return null;
  }

  if (!supabaseServerClient) {
    supabaseServerClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });
  }

  return supabaseServerClient;
}
