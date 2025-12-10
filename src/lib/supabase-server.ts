/*
Full replacement file: src/lib/supabase-server.ts
Purpose: Simple, safe server-side Supabase client for Jarvis.

How to use:
- Import { getSupabaseServer } from '@/lib/supabase-server'
- const sb = getSupabaseServer();
- Use sb.from(...).select(...) or sb.rpc(...)

Notes:
- This file expects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set in env.
- It creates a singleton Supabase client to avoid multiple connections.
- Keep simple. No fancy wrappers here — just a small helper.
*/

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseServerClient: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (supabaseServerClient) return supabaseServerClient;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // Fail fast with a clear error message so you know what's missing.
    throw new Error(
      'Missing Supabase env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.'
    );
  }

  // Create a server-side client. We disable auth persistence for server usage.
  supabaseServerClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "x-jarvis-server": "1" } },
  });

  return supabaseServerClient;
}

// Small helper: run a Postgres RPC function from Supabase, with safer typing.
export async function runRpc<T = any>(fnName: string, params: Record<string, any> = {}) {
  const sb = getSupabaseServer();
  const { data, error } = await sb.rpc(fnName, params);
  if (error) {
    // Throw a clear error so callers can handle or log it.
    throw new Error(`Supabase RPC ${fnName} error: ${error.message}`);
  }
  return data as T;
}

// Small helper: convenience to select from a table with limit (server-side)
export async function selectFrom<T = any>(table: string, columns = "*", filters: Record<string, any> = {}, limit = 100) {
  const sb = getSupabaseServer();
  let query: any = sb.from(table).select(columns);

  // apply simple eq filters
  for (const [k, v] of Object.entries(filters)) {
    if (v === null) {
      query = query.is(k, null);
    } else {
      query = query.eq(k, v);
    }
  }

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase selectFrom ${table} error: ${error.message}`);
  return data as T[];
}

export default getSupabaseServer;
