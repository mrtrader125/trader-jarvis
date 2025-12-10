// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal Telegram webhook route.
 * - Always returns 200 quickly to Telegram (ACK)
 * - Writes the received update into server logs (so you can inspect Vercel logs)
 * - Keeps the logic tiny so merges are simple; full processing is done by processPending.
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    console.error("[telegram route] incoming update:", JSON.stringify(body)?.slice(0, 10000));
    // Optionally persist to Supabase/journal in your full implementation.
    // Return 200 quickly so Telegram doesn't retry.
    return NextResponse.json({ ok: true, accepted: true }, { status: 200 });
  } catch (e: any) {
    console.error("[telegram route] parse error:", String(e?.message ?? e));
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 200 });
  }
}
