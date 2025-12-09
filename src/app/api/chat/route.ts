// src/app/api/chat/
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groqClient } from "@/lib/groq";
import { getNowInfo } from "@/lib/time";
import FormData from "form-data";

export const runtime = "nodejs";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/** Helper: parse numeric chat id candidates safely */
function parseChatId(candidate: any): number | null {
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (/^-?\d+$/.test(trimmed)) {
      try {
        return Number(trimmed);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Sends simple text message to Telegram (safe error extraction) */
async function sendTelegramText(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch (parseErr) {
      console.warn("Telegram response not JSON:", parseErr);
      const txt = await res.text();
      return { ok: res.ok, error: txt || `HTTP ${res.status}` };
    }

    if (!res.ok) {
      const desc = json?.description ?? json?.error ?? JSON.stringify(json);
      console.error("Telegram API returned error:", desc, json);
      return { ok: false, error: desc, raw: json };
    }

    return { ok: true, result: json, raw: json };
  } catch (err: any) {
    console.error("sendTelegramText exception:", err);
    return { ok: false, error: String(err) };
  }
}

/** Extract first JSON object from text (handles fenced ```json blocks and trailing commas) */
function extractFirstJsonObject(text?: string | null): any | null {
  if (!text) return null;
  const fenceMatch = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  let candidate = fenceMatch ? fenceMatch[1] : text;

  const start = candidate.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const jsonText = candidate.slice(start, i + 1);
        try {
          return JSON.parse(jsonText);
        } catch (e) {
          try {
            const cleaned = jsonText.replace(/,(\s*[}\]])/g, "$1");
            return JSON.parse(cleaned);
          } catch (e2) {
            return null;
          }
        }
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userMessage = body?.message ?? "";
  const supabase = createClient();

  // Load profile (single-user)
  let profile: any = null;
  try {
    const { data, error } = await supabase.from("jarvis_profile").select("*").eq("user_id", "single-user").single();
    if (!error) profile = data;
    else console.warn("profile load error:", error);
  } catch (err) {
    console.error("profile load exception:", err);
  }

  // Build a very small system prompt — keep it short here; your app may use a richer prompt.
  const nowInfo = getNowInfo(profile?.timezone || "Asia/Kolkata");
  const systemPrompt = `You are Jarvis, a trading & life companion for one user. Keep messages short and, if the user asks to "send to telegram", produce JSON like:
\`\`\`json
{ "action": "send_telegram", "text": "message to send" }
\`\`\`
or include "chat_id" as a number only if they explicitly request sending to a particular chat id.
Current local time: ${nowInfo.timeString}`;

  // call model
  let rawReply = "Okay bro.";
  try {
    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      stream: false,
    });
    rawReply = (completion.choices?.[0]?.message?.content as string) || rawReply;
  } catch (e) {
    console.error("LLM error:", e);
  }

  // parse action
  const maybeAction = extractFirstJsonObject(rawReply);
  let actionResultSummary: string | null = null;

  if (maybeAction && maybeAction.action) {
    try {
      const action = maybeAction.action;
      if (action === "send_telegram") {
        const actionText: string = maybeAction.text ?? "";
        const modelCandidate = maybeAction.chat_id ?? null;

        // 1) prefer model-provided numeric chat_id only if valid integer
        let chatTarget = parseChatId(modelCandidate);

        // 2) fallback to saved profile value (strong preference)
        if (!chatTarget && profile?.telegram_chat_id) {
          chatTarget = parseChatId(profile.telegram_chat_id);
        }

        // 3) fallback to env TELEGRAM_CHAT_ID if present
        if (!chatTarget && process.env.TELEGRAM_CHAT_ID) {
          chatTarget = parseChatId(process.env.TELEGRAM_CHAT_ID);
        }

        // 4) if still no chatTarget, fail with friendly message rather than calling Telegram
        if (!chatTarget) {
          actionResultSummary =
            "Failed to send: no valid chat id found. Open your bot in Telegram and press Start, or set TELEGRAM_CHAT_ID in env.";
        } else {
          const tg = await sendTelegramText(Number(chatTarget), String(actionText));
          const tgError = tg.error;
          const tgErrorMsg =
            typeof tgError === "string"
              ? tgError
              : tgError && typeof tgError === "object"
              ? (tgError.description ?? tgError.error ?? JSON.stringify(tgError))
              : String(tgError);

          actionResultSummary = tg.ok ? "Sent to Telegram." : `Telegram send failed: ${tgErrorMsg}`;

          // log notification (try/catch non-blocking)
          try {
            await supabase.from("jarvis_notifications").insert([
              {
                user_id: "single-user",
                type: "telegram",
                payload: { action: "send_telegram", chat_id: chatTarget, text: actionText },
                result: tg,
                created_at: new Date().toISOString(),
              },
            ]);
          } catch (e) {
            console.warn("Failed to log notification:", e);
          }
        }
      } else {
        actionResultSummary = `Unknown action: ${maybeAction.action}`;
      }
    } catch (e) {
      console.error("Error executing action:", e);
      actionResultSummary = `Error executing action: ${String(e)}`;
    }
  }

  // remove json block and prepare reply
  const cleaned = (rawReply || "").replace(/```(?:json)?[\s\S]*?```/i, "").trim();
  let finalOutgoingText = cleaned || actionResultSummary || "Done.";

  // return the model reply to the web UI (the UI will display it)
  return NextResponse.json({ ok: true, text: finalOutgoingText, actionResult: actionResultSummary });
}
