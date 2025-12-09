// src/lib/telegram.ts
// sendToTelegram helper used by api/telegram route.
// Exports named function sendToTelegram(chatId, text) and default export for backward compatibility.

export async function sendToTelegram(chatId: string | number, text: string, opts?: { parseMode?: "Markdown" | "HTML" }) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.warn("sendToTelegram: TELEGRAM_BOT_TOKEN missing");
    throw new Error("Missing TELEGRAM_BOT_TOKEN env var");
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body: any = {
    chat_id: chatId,
    text: String(text),
  };

  if (opts?.parseMode) body.parse_mode = opts.parseMode;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.warn("sendToTelegram failed:", res.status, txt);
    throw new Error(`sendToTelegram failed: ${res.status} ${txt}`);
  }

  const json = await res.json();
  return json;
}

// For older callers importing default
export default {
  sendToTelegram,
};
