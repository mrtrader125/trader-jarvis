// src/app/api/telegram/processPending/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import composeLib from '@/lib/chat-composer';
import memoryLib from '@/lib/jarvis-memory';

const supabase = createClient();

export const runtime = 'nodejs';

// === CONFIG ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : null;

// API key to protect this worker (set in Vercel envs)
const JARVIS_API_KEY = process.env.JARVIS_API_KEY ?? null;
if (!JARVIS_API_KEY) console.warn('JARVIS_API_KEY not set — processPending endpoint will be inaccessible without header.');

// Helper: send Telegram message
async function sendTelegramMessage(chatId: number | string, text: string, replyToMessageId?: number) {
  if (!TELEGRAM_API_BASE) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  const url = `${TELEGRAM_API_BASE}/sendMessage`;
  const body: any = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return json;
}

// Import raw journal rows into telegram_updates table (idempotent)
async function importFromJournal(limit = 50) {
  try {
    const { data: rawRows, error: rawErr } = await supabase
      .from('journal')
      .select('id, user_id, message')
      .eq('source', 'telegram-webhook-raw')
      .limit(limit);

    if (rawErr) throw rawErr;
    if (!rawRows || rawRows.length === 0) return 0;

    let imported = 0;
    for (const r of rawRows) {
      try {
        const update = r.message;
        const updateId = update?.update_id ?? (update?.message?.message_id ? Number(update.message.message_id) : null);
        if (!updateId) continue;

        // Use upsert-like behavior: ignore duplicates
        try {
          await supabase
            .from('telegram_updates')
            .insert({
              update_id: updateId,
              user_id: String(update?.message?.from?.id ?? update?.message?.chat?.id ?? 'telegram_unknown'),
              payload: update,
              source: 'journal_import',
            });
        } catch (insertErr: any) {
          // If unique constraint violation occurs, ignore
          // supabase-js older versions may throw — safe to ignore duplicates
          // console.warn('insert error (likely duplicate):', insertErr?.message ?? insertErr);
        }
        imported += 1;
      } catch (e) {
        continue;
      }
    }
    return imported;
  } catch (e) {
    console.warn('importFromJournal failed:', e);
    return 0;
  }
}

async function fetchPendingUpdates(batchSize = 10) {
  const { data, error } = await supabase
    .from('telegram_updates')
    .select('id, update_id, user_id, payload, processed')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) throw error;
  return data ?? [];
}

async function markProcessed(id: string) {
  try {
    const { data, error } = await supabase
      .from('telegram_updates')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) console.warn('markProcessed error:', error);
    return data;
  } catch (e) {
    console.warn('markProcessed exception:', e);
  }
}

async function processUpdate(row: any) {
  const payload = row.payload;
  const updateId = row.update_id;
  const chatId = payload?.message?.chat?.id ?? payload?.message?.from?.id;
  const messageId = payload?.message?.message_id ?? null;
  const userId = String(row.user_id ?? chatId ?? 'telegram_unknown');

  let text = payload?.message?.text ?? null;
  if (!text) {
    await supabase.from('journal').insert({ user_id: userId, message: { event: 'no_text_in_pending', update: payload }, source: 'processPending' });
    await markProcessed(row.id);
    return { ok: false, reason: 'no_text' };
  }

  const convoHistory = [{ role: 'user', content: text, ts: new Date().toISOString() }];

  // 1) Call composer
  let jarvisResp;
  try {
    jarvisResp = await composeLib.composeAndCallJarvis({
      userId,
      instruction: text,
      convoHistory,
    });
  } catch (e) {
    await supabase.from('journal').insert({ user_id: userId, message: { event: 'compose_error', error: String(e?.message ?? e), payload }, source: 'processPending' });
    return { ok: false, reason: 'compose_error', error: String(e?.message ?? e) };
  }

  // 2) Save conversation & journal
  try {
    await memoryLib.saveConversation({
      userId,
      messages: convoHistory.concat([{ role: 'assistant', content: jarvisResp?.text ?? '' }]),
      summary: `${text.slice(0, 400)}\n\nJARVIS: ${(jarvisResp?.text ?? '').slice(0, 800)}`,
    });
    await memoryLib.writeJournal(userId, { event: 'telegram_processed', update_id: updateId, provenance: jarvisResp?.provenance ?? [] }, 'processPending');
  } catch (e) {
    console.warn('saveConversation/writeJournal failed:', e);
  }

  // 3) Send reply
  try {
    const safeText = String(jarvisResp?.text ?? 'Jarvis is awake, but had nothing to say.');
    if (TELEGRAM_API_BASE) {
      await sendTelegramMessage(chatId, safeText, messageId);
    }
  } catch (e) {
    await supabase.from('journal').insert({ user_id: userId, message: { event: 'send_message_failed', error: String(e?.message ?? e), update: payload }, source: 'processPending' });
    return { ok: false, reason: 'send_failed', error: String(e?.message ?? e) };
  }

  await markProcessed(row.id);
  return { ok: true };
}

// ========== MAIN ENTRY ==========
export async function POST(req: NextRequest) {
  // Protect endpoint with API key (x-jarvis-key)
  const incomingKey = req.headers.get('x-jarvis-key') ?? req.headers.get('x-jarvis-key'.toLowerCase());
  if (!JARVIS_API_KEY || !incomingKey || incomingKey !== JARVIS_API_KEY) {
    return NextResponse.json({ ok: false, error: 'missing_or_invalid_api_key' }, { status: 401 });
  }

  try {
    // import any recent journal rows
    await importFromJournal(200);

    const batchSize = 10;
    const pending = await fetchPendingUpdates(batchSize);

    if (!pending || pending.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: 'no_pending' }, { status: 200 });
    }

    const results = [];
    for (const row of pending) {
      try {
        const r = await processUpdate(row);
        results.push({ id: row.id, update_id: row.update_id, result: r });
      } catch (e) {
        results.push({ id: row.id, update_id: row.update_id, result: { ok: false, error: String(e) } });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results }, { status: 200 });
  } catch (e) {
    console.error('processPending error:', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
