// src/app/api/telegram/route.js
// Telegram <-> Jarvis bridge
// - Text + short-term memory per chat
// - Voice input via Deepgram STT (binary audio)
// - Voice replies via Deepgram TTS
// - Uses your existing /api/chat as Jarvis brain

import { textToSpeechBuffer } from "@/lib/jarvis-tts";
import { PRIMARY_USER_ID } from "@/lib/constants";

// In-memory short-term context per Telegram chat
const conversations = new Map(); // chatId -> [{ role, content }, ...]
const MAX_MESSAGES = 12;

// Base URL for calling your Jarvis brain
// You can override this in Vercel with JARVIS_BASE_URL later if needed.
const BASE_URL =
  process.env.JARVIS_BASE_URL || "https://trader-jarvis.vercel.app";

// --- Telegram helpers --- //

async function sendTelegramText(chatId, text) {
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

async function sendTelegramVoice(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is missing for voice");
    return;
  }

  const audioBuffer = await textToSpeechBuffer(text);
  if (!audioBuffer) return;

  const url = `https://api.telegram.org/bot${token}/sendVoice`;

  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));

    const blob = new Blob([audioBuffer], { type: "audio/ogg" });
    form.append("voice", blob, "jarvis.ogg");

    await fetch(url, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    console.error("Failed to send Telegram voice:", err);
  }
}

// Always send text first, then voice for the SAME reply
async function sendJarvisReply(chatId, text) {
  await sendTelegramText(chatId, text);
  try {
    await sendTelegramVoice(chatId, text);
  } catch (e) {
    console.error("sendJarvisReply voice error:", e);
  }
}

// --- Deepgram STT helper --- //

async function transcribeAudioBinary(audioArrayBuffer) {
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) {
    console.error("Missing DEEPGRAM_API_KEY for STT");
    return "__NO_DEEPGRAM_KEY__";
  }

  try {
    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${dgKey}`,
          "Content-Type": "audio/ogg", // Telegram voice = OGG/OPUS
        },
        body: Buffer.from(audioArrayBuffer),
      }
    );

    if (!dgRes.ok) {
      console.error("Deepgram STT error:", dgRes.status, await dgRes.text());
      return null;
    }

    const data = await dgRes.json();
    const transcript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    return transcript.trim() || null;
  } catch (err) {
    console.error("Deepgram STT request failed:", err);
    return null;
  }
}

// --- Call Jarvis brain (/api/chat) with memory --- //

async function askJarvisViaChatAPI(chatId, userText) {
  let history = conversations.get(chatId) || [];

  // add current user message
  history = [...history, { role: "user", content: userText }];

  // trim short-term memory
  if (history.length > MAX_MESSAGES) {
    history = history.slice(history.length - MAX_MESSAGES);
  }

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history,
        // 🔐 unify identity with web:
        userId: PRIMARY_USER_ID,
        channel: "telegram",
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(
        "Error calling /api/chat from Telegram:",
        res.status,
        errorText
      );
      return "Bro, my brain had an issue reaching the main server. Try again in a bit.";
    }

    const data = await res.json();
    const reply =
      data.reply ||
      "Bro, my brain glitched for a sec while talking to the main server. Try again.";

    // add assistant reply to memory
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

// --- Main Telegram webhook handler --- //

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

    // /id -> return chat id
    if (message.text && message.text.trim() === "/id") {
      await sendTelegramText(chatId, `Your chat id is: \`${chatId}\``);
      return new Response("ok", { status: 200 });
    }

    // /start
    if (message.text && message.text.trim() === "/start") {
      await sendTelegramText(
        chatId,
        "Yo bro, I'm Jarvis in Telegram now 🚀\n\nTalk to me about trading, emotions or life. I'll remember the conversation and guide you.\n\nSend *text or voice messages* — I'll reply in both text and voice."
      );
      return new Response("ok", { status: 200 });
    }

    // /reset -> wipe short-term memory
    if (message.text && message.text.trim() === "/reset") {
      conversations.delete(chatId);
      await sendTelegramText(
        chatId,
        "Memory wiped for this chat bro 🧹. We start fresh now."
      );
      return new Response("ok", { status: 200 });
    }

    // --- Voice message flow --- //
    if (message.voice) {
      const fileId = message.voice.file_id;

      try {
        // 1) get file path from Telegram
        const getFileUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;
        const fileRes = await fetch(getFileUrl);
        const fileData = await fileRes.json();

        if (!fileData.ok) {
          console.error("getFile error:", fileData);
          await sendTelegramText(
            chatId,
            "Bro, I couldn't access that voice message. Try again or type it."
          );
          return new Response("ok", { status: 200 });
        }

        const filePath = fileData.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

        // 2) download audio
        const audioRes = await fetch(fileUrl);
        if (!audioRes.ok) {
          console.error(
            "Error downloading audio from Telegram:",
            audioRes.status
          );
          await sendTelegramText(
            chatId,
            "Bro, I couldn't download that voice clearly. Can you send it again or type it?"
          );
          return new Response("ok", { status: 200 });
        }

        const audioArrayBuffer = await audioRes.arrayBuffer();

        // 3) transcribe with Deepgram
        const transcript = await transcribeAudioBinary(audioArrayBuffer);

        if (transcript === "__NO_DEEPGRAM_KEY__") {
          await sendTelegramText(
            chatId,
            "Bro, my speech brain (Deepgram) isn't configured on the server yet. Ask future-you to set DEEPGRAM_API_KEY in Vercel."
          );
          return new Response("ok", { status: 200 });
        }

        if (!transcript) {
          await sendTelegramText(
            chatId,
            "Bro, I couldn't understand that voice clearly. Can you send it again or type it?"
          );
          return new Response("ok", { status: 200 });
        }

        // 4) ask Jarvis with transcript
        const reply = await askJarvisViaChatAPI(
          chatId,
          `(voice) ${transcript}`
        );
        await sendJarvisReply(chatId, reply);
        return new Response("ok", { status: 200 });
      } catch (err) {
        console.error("Error handling voice message:", err);
        await sendTelegramText(
          chatId,
          "Bro, something broke while processing that voice note. Try again or type it out."
        );
        return new Response("ok", { status: 200 });
      }
    }

    // --- Text message flow --- //
    const text = (message.text || "").trim();
    if (!text) {
      return new Response("No text", { status: 200 });
    }

    const reply = await askJarvisViaChatAPI(chatId, text);
    await sendJarvisReply(chatId, reply);

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    if (chatId) {
      await sendTelegramText(
        chatId,
        "Bro, something broke on the server side. Try again in a minute."
      );
    }
    return new Response("error", { status: 200 });
  }
}
