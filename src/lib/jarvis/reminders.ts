// src/lib/jarvis/reminders.ts

import type { SupabaseClient } from "@supabase/supabase-js";

export type ReminderSource = "web" | "telegram";

interface ReminderOptions {
  text: string | undefined | null;
  supabase: SupabaseClient;
  source: ReminderSource;
  timezone: string;
  telegramChatId?: number;
}

/**
 * Simple parser for:
 *  - "remind me in 10 minutes to close charts"
 *  - "remind me in 2 hours about journaling"
 *
 * We keep it simple & reliable: relative time only (minutes/hours).
 */
function parseRelativeReminder(text: string) {
  const re = /remind me in\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\s*(?:to|about)?\s*(.+)?/i;
  const match = text.match(re);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  if (Number.isNaN(amount) || amount <= 0) return null;

  const unitRaw = match[2].toLowerCase();
  const bodyRaw = (match[3] || "").trim();
  const isHours = unitRaw.startsWith("hour") || unitRaw.startsWith("hr");

  const minutes = isHours ? amount * 60 : amount;
  const body = bodyRaw || "check in with you";

  return { minutes, body };
}

/**
 * Special case: "send me a message in telegram" from web.
 * We treat this as a 1-minute reminder ping.
 */
function parseTelegramPing(text: string) {
  const lowered = text.toLowerCase();
  if (
    lowered.includes("send me a message") &&
    lowered.includes("telegram")
  ) {
    return {
      minutes: 1,
      body: "Yo bro, it's Jarvis here on Telegram like you asked from the web chat. 😊",
    };
  }
  return null;
}

export interface ReminderResult {
  confirmation: string;
}

/**
 * Try to detect and create a reminder.
 * Returns null if the text is not a reminder command.
 */
export async function tryCreateReminderFromText(
  opts: ReminderOptions
): Promise<ReminderResult | null> {
  const { text, supabase, source, telegramChatId } = opts;

  if (!text) return null;
  const normalized = text.trim();

  // 1) Telegram ping intent (web only is most common)
  const ping = parseTelegramPing(normalized);
  let parsed = ping;

  // 2) Relative reminder intent
  if (!parsed) {
    parsed = parseRelativeReminder(normalized);
  }

  if (!parsed) return null;

  const { minutes, body } = parsed;

  const now = Date.now();
  const dueDate = new Date(now + minutes * 60 * 1000);
  const dueAtIso = dueDate.toISOString();

  // Determine Telegram chat id
  let chatId: string | null = null;
  if (source === "telegram" && telegramChatId) {
    chatId = String(telegramChatId);
  } else {
    // web source: use primary chat id from env
    const envChat = process.env.TELEGRAM_PRIMARY_CHAT_ID;
    if (envChat) chatId = envChat;
  }

  // Insert into Supabase
  try {
    const { error } = await supabase.from("jarvis_reminders").insert({
      user_id: "single-user",
      body,
      due_at: dueAtIso,
      channel: "telegram",
      chat_id: chatId,
    });

    if (error) {
      console.error("Error inserting reminder:", error.message);
    }
  } catch (e) {
    console.error("Exception inserting reminder:", e);
  }

  const confirmation =
    minutes === 1
      ? `Got it, Bro. I'll ping you in about a minute: **${body}**.`
      : `Got it, Bro. I'll remind you in ${minutes} minute(s) to **${body}**.`;

  return { confirmation };
}
