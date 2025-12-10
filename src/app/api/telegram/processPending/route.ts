/**
 * src/app/api/telegram/processPending/route.ts
 * Minimal, safe processor for pending Telegram updates.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // This is intentionally conservative: we do not perform destructive writes here.
    // If you want full processing, replace this file with your richer implementation
    // that reads pending updates from your DB (Supabase) and calls compose/send functions.
    try {
      const mod: any = await import("@/lib/chat-composer").catch(() => null);
      if (mod && (typeof mod.compose === "function" || typeof mod.composeAndCallJarvis === "function")) {
        console.error("[processPending] compose available for diagnostics");
      } else {
        console.error("[processPending] no compose implem found");
      }
    } catch (e) {
      console.error("[processPending] loader error:", String(e));
    }

    // return processed:0 as a safe no-op
    return NextResponse.json({ ok: true, processed: 0 }, { status: 200 });
  } catch (err: any) {
    console.error("[processPending] unexpected:", String(err?.message ?? err));
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
