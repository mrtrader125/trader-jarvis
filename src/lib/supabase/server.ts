// src/lib/supabase/server.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in environment variables");
}

if (!supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in environment variables");
}

// ❗ This client is for SERVER-SIDE USE ONLY.
// Do NOT import this in client components.
export function createClient() {
  return createSupabaseClient(supabaseUrl!, supabaseServiceRoleKey!, {
    auth: {
      // We are using the service role key on the server, so we don't rely on browser sessions here.
      persistSession: false,
    },
  });
}
