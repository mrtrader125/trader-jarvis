// src/lib/supabase-server.js

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Server-only Supabase client (no cookies, no browser stuff)
export const supabaseServer =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          persistSession: false,
        },
      })
    : null;

// Tiny helper so we can log without crashing Jarvis if Supabase is misconfigured
export async function logJarvisConversation({
  source = "web",
  chatId = "web-default",
  userId = null,
  userMessage,
  assistantReply,
  meta = {},
}) {
  try {
    if (!supabaseServer) {
      console.warn(
        "[Jarvis] Supabase not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY). Skipping logging."
      );
      return;
    }

    if (!userMessage && !assistantReply) return;

    const rows = [];

    if (userMessage) {
      rows.push({
        source,
        chat_id: String(chatId),
        user_id: userId ? String(userId) : null,
        role: "user",
        content: String(userMessage),
        meta,
      });
    }

    if (assistantReply) {
      rows.push({
        source,
        chat_id: String(chatId),
        user_id: userId ? String(userId) : null,
        role: "assistant",
        content: String(assistantReply),
        meta,
      });
    }

    if (!rows.length) return;

    const { error } = await supabaseServer.from("jarvis_messages").insert(rows);

    if (error) {
      console.error("[Jarvis] Supabase logging error:", error);
    }
  } catch (err) {
    console.error("[Jarvis] Unexpected Supabase logging error:", err);
  }
}
