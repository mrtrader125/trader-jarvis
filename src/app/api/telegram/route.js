import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Simple Jarvis brain for Telegram
async function askJarvisFromTelegram(text) {
  const completion = await groq.chat.completions.create({
    model: "llama-3.1-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "You are Jarvis, a friendly but honest trading & life companion for a discretionary trader. You know he struggles with discipline, emotions, FOMO, revenge trading and wants consistency & financial freedom. Talk in a casual bro tone, short and clear, but give real guidance.",
      },
      {
        role: "user",
        content: text,
      },
    ],
    temperature: 0.7,
  });

  const reply =
    completion.choices?.[0]?.message?.content?.trim() ||
    "Bro, my brain glitched for a sec. Try again.";
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

    // Only handle normal text messages for now
    const message = update.message;
    if (!message || !message.text) {
      return new Response("No message", { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Optional: basic /start command
    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "Yo bro, I'm Jarvis in Telegram now 🚀\n\nJust send me a message about trading, emotions or life and I'll reply."
      );
      return new Response("ok", { status: 200 });
    }

    // Call Jarvis brain (Groq)
    const reply = await askJarvisFromTelegram(text);

    // Send back to Telegram
    await sendTelegramMessage(chatId, reply);

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return new Response("error", { status: 200 }); // always 200 so Telegram doesn't spam retries too hard
  }
}
