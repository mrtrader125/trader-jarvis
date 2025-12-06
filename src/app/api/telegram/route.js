// This route connects Telegram <-> your existing /api/chat brain.
// It keeps short conversation memory per Telegram chat and forwards
// messages to /api/chat, which already talks to Groq.

const conversations = new Map(); // chatId -> [{ role, content }, ...]
const MAX_MESSAGES = 12;

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is missing");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("Failed to send Telegram message:", err);
  }
}

// Forward the conversation to /api/chat (your existing Jarvis brain)
async function askJarvisViaChatAPI(chatId, userText, req) {
  // Load history
  let history = conversations.get(chatId) || [];

  // Add user message
  history = [...history, { role: "user", content: userText }];

  // Trim
  if (history.length > MAX_MESSAGES) {
    history = history.slice(history.length - MAX_MESSAGES);
  }

  // Build base URL from request headers (works on Vercel)
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const baseUrl = `${proto}://${host}`;

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });

    if (!res.ok) {
      console.error("Error calling /api/chat from Telegram:", res.status);
      return "Bro, my brain had an issue reaching the main server. Try again in a bit.";
    }

    const data = await res.json();
    const reply =
      data.reply ||
      "Bro, my brain glitched for a sec while talking to the main server. Try again.";

    // Save assistant reply in history
    history = [...history, { role: "assistant", content: reply }];
    if (history.length > MAX_MESSAGES) {
      history = history.slice(history.length - MAX_MESSAGES);
    }
    conversations.set(chatId, history);

    return reply;
  } catch (err) {
    console.error("Error in askJarvisViaChatAPI:", err);
    return "Bro, something broke while talking to the main Jarvis brain. Try again in a minute.";
  }
}

export async function POST(req) {
  let chatId = null;

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("Missing TELEGRAM_BOT_TOKEN");
      return new Response("Bot token missing", { status: 500 });
    }

    const update = await req.json();
    const message = update.message;

    if (!message || !message.text) {
      return new Response("No message", { status: 200 });
    }

    chatId = message.chat.id;
    const text = message.text.trim();

    // /start = intro
    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "Yo bro, I'm Jarvis in Telegram now 🚀\n\nTalk to me about trading, emotions or life. I'll remember the conversation and guide you."
      );
      return new Response("ok", { status: 200 });
    }

    // /reset = wipe memory
    if (text === "/reset") {
      conversations.delete(chatId);
      await sendTelegramMessage(
        chatId,
        "Memory wiped for this chat bro 🧹. We start fresh now."
      );
      return new Response("ok", { status: 200 });
    }

    // Normal text → forward to /api/chat with memory
    const reply = await askJarvisViaChatAPI(chatId, text, req);
    await sendTelegramMessage(chatId, reply);

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    if (chatId) {
      await sendTelegramMessage(
        chatId,
        "Bro, something broke on the server side. Try again in a minute."
      );
    }
    return new Response("error", { status: 200 });
  }
}
