// src/app/api/telegram/processPending/route.ts
/**
 * Worker to import telegram webhook raw journal rows into telegram_updates,
 * process pending updates, call Jarvis composer, send replies (written to telegram_responses),
 * and mark processed.
 *
 * Protected by X-JARVIS-KEY header (JARVIS_API_KEY env).
 *
 * NOTE: This file is a resilient replacement designed to compile cleanly on Vercel.
 * It does NOT attempt to call a specific sendMessage helper; instead it writes replies to
 * `telegram_responses`. If you want direct Telegram sending, I'll wire in your `sendMessage`.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import composeLib from "@/lib/chat-composer";
import memoryLib from "@/lib/jarvis-memory";

const supabase = createClient();

type TelegramUpdateRow = {
  id: number;
  update_id?: number | null;
  raw?: any;
  processed?: boolean;
  inserted_at?: string;
  // any other fields present in your table
};

type ComposeOpts = {
  userId?: string;
  incoming?: string;
  metadata?: any;
  // extend as needed
};

type ComposeResult = {
  ok: boolean;
  messages?: Array<{ role: string; content: string }>;
  meta?: any;
  error?: string;
};

type AnyFn = (...args: any[]) => Promise<any> | any;

/**
 * Resolve a callable compose function from the composeLib module.
 * Accepts different module shapes (default export function, named exports, etc.)
 */
function resolveComposeFn(lib: any): AnyFn | null {
  if (!lib) return null;
  // module itself is a function (common default export)
  if (typeof lib === "function") return lib as AnyFn;

  // candidate names in order
  const candidates = ["composeAndCallJarvis", "composeAndCall", "compose", "default"];

  for (const key of candidates) {
    const candidate = (lib as any)[key];
    if (typeof candidate === "function") return candidate as AnyFn;
  }

  // fallback: nested default function
  if ((lib as any).default && typeof (lib as any).default === "function") {
    return (lib as any).default as AnyFn;
  }

  return null;
}

/**
 * Process a single telegram update row:
 * - parse raw payload
 * - call the compose function (if available)
 * - insert reply to telegram_responses (so another worker or process can send it)
 * - mark update processed
 */
async function processUpdate(row: TelegramUpdateRow): Promise<ComposeResult> {
  // normalize payload
  const raw = row.raw ?? {};
  const text =
    raw?.message?.text ??
    raw?.message?.caption ??
    raw?.edited_message?.text ??
    raw?.channel_post?.text ??
    raw?.callback_query?.data ??
    "";

  const userId =
    (raw?.message?.from?.id ?? raw?.from?.id ?? raw?.callback_query?.from?.id) +
    "" ||
    "unknown";

  const callPayload: ComposeOpts = {
    userId,
    incoming: text,
    metadata: {
      update_id: row.update_id ?? null,
      raw,
    },
  };

  // resolve compose function
  const composeFn = resolveComposeFn(composeLib);

  if (!composeFn) {
    console.error("[processPending] compose function not found on composeLib:", Object.keys(composeLib || {}));
    // store a journal entry
    try {
      await supabase.from("journal").insert({
        user_id: userId,
        message: { event: "compose_fn_missing", payload: callPayload },
        source: "processPending",
      });
    } catch (e) {
      console.error("[processPending] failed to write journal for compose_fn_missing:", e);
    }
    return { ok: false, error: "compose_fn_missing" };
  }

  // call compose function
  try {
    const result = await (composeFn as AnyFn)(callPayload);
    // Normalize result shape
    const normalized: ComposeResult = {
      ok: true,
      messages: result?.messages ?? result?.msgs ?? result?.response ?? [],
      meta: result?.meta ?? result?.metaData ?? {},
    };

    // persist the reply (so your sending system can pick it up)
    try {
      await supabase.from("telegram_responses").insert({
        update_id: row.update_id ?? null,
        user_id: userId,
        reply: normalized.messages,
        meta: normalized.meta ?? {},
        source: "processPending",
      });
    } catch (e) {
      console.error("[processPending] failed to write telegram_responses:", e);
      // don't fail the whole operation — we still mark processed but record the failure
    }

    // mark update processed
    try {
      await supabase.from("telegram_updates").update({ processed: true }).eq("id", row.id);
    } catch (e) {
      console.error("[processPending] failed to mark update processed:", e);
    }

    return normalized;
  } catch (err) {
    const e = err as any;
    console.error("[processPending] compose call failed:", e?.message ?? e);

    // write to journal
    try {
      await supabase.from("journal").insert({
        user_id: userId,
        message: { event: "compose_error", error: String(e?.message ?? e), payload: callPayload },
        source: "processPending",
      });
    } catch (je) {
      console.error("[processPending] failed to write journal after compose error:", je);
    }

    // mark update processed to avoid repeated infinite loops (optional — adjust if you prefer retries)
    try {
      await supabase
        .from("telegram_updates")
        .update({ processed: true, process_error: String(e?.message ?? e) })
        .eq("id", row.id);
    } catch (me) {
      console.error("[processPending] failed to mark update processed after error:", me);
    }

    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * POST /api/telegram/processPending
 * Body: none required
 * Header: X-JARVIS-KEY: <secret>
 */
export async function POST(req: NextRequest) {
  try {
    const jarvisKey = process.env.JARVIS_API_KEY ?? "";
    const provided = req.headers.get("x-jarvis-key") ?? "";

    if (!jarvisKey || jarvisKey.length < 6) {
      console.error("[processPending] missing JARVIS_API_KEY in env");
      return NextResponse.json({ ok: false, error: "missing_server_key" }, { status: 500 });
    }

    if (provided !== jarvisKey) {
      console.warn("[processPending] invalid x-jarvis-key header");
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 401 });
    }

    // fetch pending updates (adjust table name if yours differs)
    const limit = 50;
    const res = await supabase
      .from("telegram_updates")
      .select("*")
      .eq("processed", false)
      .limit(limit)
      .order("inserted_at", { ascending: true });

    // cast rows explicitly to the typed shape
    const rows = (res as any).data as TelegramUpdateRow[] | null;
    const error = (res as any).error;

    if (error) {
      console.error("[processPending] supabase select error:", error);
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }

    const results: Array<{ id?: number; update_id?: number | null; result: ComposeResult | any }> = [];

    if (!rows || (Array.isArray(rows) && rows.length === 0)) {
      return NextResponse.json({ ok: true, processed: 0, results }, { status: 200 });
    }

    // iterate and process
    for (const row of rows as TelegramUpdateRow[]) {
      try {
        const r = await processUpdate(row);
        results.push({ id: row.id, update_id: row.update_id, result: r });
      } catch (e) {
        console.error("[processPending] processUpdate threw:", e);
        results.push({ id: row.id, update_id: row.update_id, result: { ok: false, error: String(e) } });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results }, { status: 200 });
  } catch (e) {
    console.error("processPending error:", e);
    return NextResponse.json({ ok: false, error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
