// src/lib/telegram.ts
import fetch from "node-fetch";

/**
 * Minimal Telegram helper using bot token from env.
 * Exports:
 *  - sendMessage(chatId, text, options) -> { ok, result }
 *  - setWebhook(webhookUrl) -> { ok, result }
 */

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set in env.");
}

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function callTelegramMethod(method: string, body: any) {
  if (!TELEGRAM_TOKEN) {
    return { ok: false, error: "missing TELEGRAM_BOT_TOKEN" };
  }
  const url = `${TELEGRAM_API_BASE}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "invalid-json" }));
  return data;
}

export async function sendMessage(chatId: number | string, text: string, opts: any = {}) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: opts.parse_mode || "Markdown",
    reply_markup: opts.reply_markup,
    disable_notification: opts.disable_notification,
  };
  return callTelegramMethod("sendMessage", body);
}

export async function setWebhook(webhookUrl: string) {
  return callTelegramMethod("setWebhook", { url: webhookUrl });
}

export async function deleteWebhook() {
  return callTelegramMethod("deleteWebhook", {});
}

export default { sendMessage, setWebhook, deleteWebhook };
