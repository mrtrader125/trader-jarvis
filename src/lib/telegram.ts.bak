// src/lib/telegram.ts
// Minimal Telegram helper for sending messages and handling basic responses.
// Exports sendTelegramMessage(chatId, text, opts) which will attempt to post via Telegram Bot API.
// Uses env TELEGRAM_BOT_TOKEN and optional TELEGRAM_CHAT_ID (fallback for quick testing).

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FALLBACK_CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;

/**
 * Send a text message to Telegram chat.
 * - chatId may be null; if so, FALLBACK_CHAT_ID will be used if present.
 * - Throws an Error with helpful description on failure.
 */
export async function sendTelegramMessage(chatId: string | number | null, text: string, opts?: { parseMode?: string }) {
  if (!TELEGRAM_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }
  const target = chatId || FALLBACK_CHAT_ID;
  if (!target) {
    throw new Error("No Telegram chat_id available. Link your Telegram account to enable bot messages.");
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const payload = {
    chat_id: String(target),
    text,
    parse_mode: opts?.parseMode || "Markdown",
    disable_web_page_preview: true,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let json: any;
  try {
    json = await resp.json();
  } catch (e) {
    throw new Error(`Telegram returned non-JSON response (status ${resp.status})`);
  }

  if (!json || json.ok === false) {
    // Telegram provides { ok: false, error_code, description, parameters? }
    const desc = json?.description || JSON.stringify(json);
    const err = new Error(`Telegram send failed: ${desc}`);
    (err as any).telegram = json;
    throw err;
  }

  return json.result;
}

export default {
  sendTelegramMessage,
};
