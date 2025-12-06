// Telegram <-> Jarvis bridge
// - Text + short-term memory per chat
// - Voice messages via Deepgram STT
// - Uses your existing /api/chat as Jarvis brain

const conversations = new Map(); // chatId -> [{ role, content }, ...]
const MAX_MESSAGES = 12;

// --- Helpers ---

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

// Transcribe Telegram voice file using Deepgram
async function transcribeAudioFromUrl(fileUrl) {
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) {
    console.error("Missing DEEPGRAM_API_KEY");
    return null;
  }

  try {
    const res = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${dgKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: fileUrl }),
      }
    );

    if (!res.ok) {
      console.error("Deepgram error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const transcript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    return transcript.trim() || null;
  } catch (err) {
    console.error("Deepgram request failed:", err);
    return null;
  }
}

// Call your existing /api/chat Jarvis brain with memory
async function askJarvisViaChatAPI(chatId, userText, req) {
  let history = conversations.get(chatId) || [];

  history = [...history, { role: "user", content: userText }];

  if (history.length > MAX_MESSAGES) {
    history = history.slice(history.length - MAX_MESSAGES);
  }

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

// --- Main handler ---

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

    if (!message) {
      return new Response("No message", { status: 200 });
    }

    chatId = message.chat.id;

    // /id -> show chat id (useful for reminders later)
    if (message.text && message.text.trim() === "/id") {
      await sendTelegramMessage(chatId, `Your chat id is: \`${chatId}\``);
      return new Response("ok", { status: 200 });
    }

    // /start
    if (message.text && message.text.trim() === "/start") {
      await sendTelegramMessage(
        chatId,
        "Yo bro, I'm Jarvis in Telegram now 🚀\n\nTalk to me about trading, emotions or life. I'll remember the conversation and guide you.\n\nYou can also send *voice messages* and I'll understand you."
      );
      return new Response("ok", { status: 200 });
    }

    // /reset
    if (message.text && message.text.trim() === "/reset") {
      conversations.delete(chatId);
      await sendTelegramMessage(
        chatId,
        "Memory wiped for this chat bro 🧹. We start fresh now."
      );
      return new Response("ok", { status: 200 });
    }

    // --- NEW: handle voice message ---
    if (message.voice) {
      const fileId = message.voice.file_id;

      try {
        // 1) Get file path from Telegram
        const getFileUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;
        const fileRes = await fetch(getFileUrl);
        const fileData = await fileRes.json();

        if (!fileData.ok) {
          console.error("getFile error:", fileData);
          await sendTelegramMessage(
            chatId,
            "Bro, I couldn't access that voice message. Try again or type it out."
          );
          return new Response("ok", { status: 200 });
        }

        const filePath = fileData.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

        // 2) Transcribe via Deepgram
        const transcript = await transcribeAudioFromUrl(fileUrl);

        if (!transcript) {
          await sendTelegramMessage(
            chatId,
            "Bro, I couldn't understand that voice clearly. Can you send it again or type it?"
          );
          return new Response("ok", { status: 200 });
        }

        // 3) Send transcript through Jarvis brain
        const reply = await askJarvisViaChatAPI(
          chatId,
          `(voice message) ${transcript}`,
          req
        );

        await sendTelegramMessage(chatId, reply);
        return new Response("ok", { status: 200 });
      } catch (err) {
        console.error("Error handling voice message:", err);
        await sendTelegramMessage(
          chatId,
          "Bro, something broke while processing that voice note. Try again or type it out."
        );
        return new Response("ok", { status: 200 });
      }
    }

    // --- Normal text message ---
    const text = (message.text || "").trim();
    if (!text) {
      return new Response("No text", { status: 200 });
    }

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
