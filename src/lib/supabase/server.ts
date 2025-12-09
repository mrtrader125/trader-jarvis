// src/lib/supabase/server.ts
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lazy-initialized singleton client
let cachedClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    // This will now only throw when you actually call createClient()
    throw new Error(
      "Supabase environment variables are not configured. " +
        "Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment."
    );
  }

  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  return cachedClient;
}
