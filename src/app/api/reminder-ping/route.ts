// src/app/api/reminder-ping/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // optional: pre-set chat id

async function sendTelegramText(chatId: number | string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN in reminder-ping");
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error("sendTelegramText error (reminder):", err);
  }
}

async function synthesizeTTS(text: string): Promise<ArrayBuffer | null> {
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
  if (!DEEPGRAM_API_KEY) {
    console.error("Missing DEEPGRAM_API_KEY");
    return null;
  }
  try {
    const res = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-asteria-en&format=ogg",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "audio/ogg",
        },
        body: JSON.stringify({ text }),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error("Deepgram TTS error (reminder):", res.status, txt);
      return null;
    }
    return await res.arrayBuffer();
  } catch (err) {
    console.error("synthesizeTTS error (reminder):", err);
    return null;
  }
}

async function sendTelegramVoice(chatId: number | string, audioBuffer: ArrayBuffer) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN in reminder-ping");
    return;
  }
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    const blob = new Blob([audioBuffer], { type: "audio/ogg" });
    // @ts-ignore
    form.append("voice", blob, "jarvis_reminder.ogg");

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`, {
      method: "POST",
      body: form as any,
    });
  } catch (err) {
    console.error("sendTelegramVoice error (reminder):", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Find reminders due & not yet sent
    const now = new Date().toISOString();
    const { data: reminders, error } = await supabase
      .from("jarvis_reminders")
      .select("*")
      .lte("send_at", now)
      .eq("sent", false)
      .limit(50);

    if (error) {
      console.error("Error fetching reminders:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    for (const r of reminders) {
      try {
        const chatId = TELEGRAM_CHAT_ID || r.telegram_chat_id || r.chat_id || "your_chat_id_here";
        const text = r.message || "Reminder from Jarvis.";

        // Send text
        await sendTelegramText(chatId, text);

        // Attempt voice
        const audio = await synthesizeTTS(text);
        if (audio) {
          await sendTelegramVoice(chatId, audio);
        } else {
          console.error("Reminder TTS failed — text only.");
        }

        // Mark as sent
        const { error: updateErr } = await supabase
          .from("jarvis_reminders")
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq("id", r.id);

        if (updateErr) {
          console.error("Failed to mark reminder sent:", updateErr);
        }
      } catch (inner) {
        console.error("Error processing reminder id=", r.id, inner);
      }
    }

    return NextResponse.json({ ok: true, processed: reminders.length });
  } catch (err) {
    console.error("REMINDER PING ERROR:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
