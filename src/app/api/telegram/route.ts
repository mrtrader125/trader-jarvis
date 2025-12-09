// src/app/api/telegram/route.ts
// Minimal webhook: reliably ACK Telegram and persist update to journal.
// Full processing (compose -> reply) is intentionally removed for now
// so Telegram receives a stable 200 response immediately.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const supabase = createClient();

const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? null;

/** Webhook entry: ack + journal */
export async function POST(req: NextRequest) {
  // 1) secret_token verification (if configured)
  if (TELEGRAM_WEBHOOK_SECRET) {
    const incoming = req.headers.get('x-telegram-bot-api-secret-token');
    if (!incoming || incoming !== TELEGRAM_WEBHOOK_SECRET) {
      // Do not reveal secret, return 401 so Telegram (or attacker) cannot spam
      return NextResponse.json({ ok: false, error: 'invalid_secret' }, { status: 401 });
    }
  }

  let update: any = null;
  try {
    update = await req.json();
  } catch (e) {
    // Bad JSON — respond 400 quickly
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  // 2) Persist raw update to Supabase journal table for later processing
  try {
    await supabase.from('journal').insert({
      user_id: String((update?.message?.from?.id) ?? (update?.message?.chat?.id) ?? 'telegram_unknown'),
      message: update,
      source: 'telegram-webhook-raw',
    });
  } catch (e) {
    // journaling failure should not block 200 response — log to console
    console.warn('journal insert failed (telegram webhook):', e);
  }

  // 3) Return 200 immediately so Telegram marks delivery as OK
  // We return a small JSON acknowledging receipt.
  return NextResponse.json({ ok: true, accepted: true }, { status: 200 });
}
