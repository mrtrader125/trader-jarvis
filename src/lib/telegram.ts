// src/lib/telegram.ts
/**
 * Minimal Telegram helper shim.
 * - sendMessage(chatId, text) is a safe stub that logs and returns a success object.
 * Replace with real API call using TELEGRAM_BOT_TOKEN in production.
 */

export async function sendMessage(chatId: number | string, text: string) {
  console.error("[telegram helper] sendMessage called:", { chatId, text: String(text).slice(0,200) });
  // If TELEGRAM_BOT_TOKEN is available and you want to actually send:
  // fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', body: JSON.stringify({ chat_id: chatId, text }) })
  return { ok: true };
}

export default { sendMessage };
