import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Simple in-memory conversation store per Telegram chat
// NOTE: On serverless this can reset if the instance is recycled.
// For persistent memory, later we can plug in a real database.
const conversations = new Map(); // chatId -> [{ role, content }, ...]
const MAX_MESSAGES = 12; // how many recent turns to keep in context

function getSystemPrompt() {
  return {
    role: "system",
    content:
      "You are Jarvis, a friendly but honest trading & life companion for a discretionary trader. " +
      "You know he struggles with discipline, emotions, FOMO, revenge trading and wants consistency & financial freedom. " +
      "Talk in a casual bro tone (use 'bro' sometimes), short and clear, but give real guidance. " +
      "He often messages you from his phone via Telegram, so keep answers compact but meaningful.",
  };
}

async function askJarvisWithMemory(chatId, userText) {
  // Get existing history for this chat
  let history = conversations.get(chatId) || [];

  // Add the new user message
  history = [...history, { role: "user", content: userText }];

  // Trim to last N messages to avoid huge context
  if (history.length > MAX_MESSAGES) {
    history = history.slice(history.length - MAX_MESSAGES);
  }

  // Build messages for Groq: system + history
  const messagesForGroq = [getSystemPrompt(), ...history];

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-70b-versatile",
    messages: messagesForGroq,
    temperature: 0.7,
  });

  const reply =
    completion.choices?.[0]?.message?.content?.trim() ||
    "Bro, my brain glitched for a sec. Try again.";

  // Add assistant reply to history
  history = [...history, { role: "assistant", content: reply }];

  // Trim again if needed
  if (history.length > MAX_MESSAGES) {
    history = history.slice(history.length - MAX_MESSAGES);
  }

  // Save back to memory
  conversations.set(chatId, history);

  return reply;
}

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is missing");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

export async function POST(req) {
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

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Handle /start
    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "Yo bro, I'm Jarvis in Telegram now 🚀\n\nTalk to me about trading, emotions or life. I'll remember the conversation and guide you."
      );
      return new Response("ok", { status: 200 });
    }

    // Handle /reset to clear memory
    if (text === "/reset") {
      conversations.delete(chatId);
      await sendTelegramMessage(
        chatId,
        "Memory wiped for this chat bro 🧹. We start fresh now."
      );
      return new Response("ok", { status: 200 });
    }

    // Normal message: call Jarvis with memory
    const reply = await askJarvisWithMemory(chatId, text);

    await sendTelegramMessage(chatId, reply);

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    // Return 200 so Telegram doesn't keep retrying aggressively
    return new Response("error", { status: 200 });
  }
}
