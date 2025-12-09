// trader-jarvis/src/app/api/telegram/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groqClient } from "@/lib/groq";
import { getNowInfo } from "@/lib/time";
import {
  isPercentOfTargetQuestion,
  buildPercentOfTargetAnswerFromText,
} from "@/lib/jarvis/math";
import { loadFinance, buildFinanceContextSnippet } from "@/lib/jarvis/finance";
import { buildKnowledgeContext } from "@/lib/jarvis/knowledge/context";
import { tryCreateReminderFromText } from "@/lib/jarvis/reminders";

// Preserved helpers from OLD file (tone, history, trading memory)
import { detectToneMode, buildToneDirective } from "@/lib/jarvis/tone";
import { loadRecentHistory, saveHistoryPair } from "@/lib/jarvis/history";
import {
  autoUpdateTradingMemoryFromUtterance,
  loadTradingProfile,
  buildTradingProfileSnippet,
} from "@/lib/jarvis/tradingMemory";

export const runtime = "nodejs";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    date?: number;
  };
};

function isTimeQuestion(text: string | undefined | null): boolean {
  if (!text) return false;
  const q = text.toLowerCase();
  return (
    q.includes("current time") ||
    q.includes("time now") ||
    q.includes("what's the time") ||
    q.includes("whats the time") ||
    q === "time?" ||
    q === "time"
  );
}

function stripSentAtPrefix(text: string): string {
  return text.replace(/^\s*\[sent_at:[^\]]*\]\s*/i, "");
}

/**
 * Very simple tag detector for Knowledge Center relevance.
 * This decides which knowledge items are most relevant for this Telegram message.
 */
function detectIntentTags(text: string | undefined | null): string[] {
  if (!text) return ["general"];
  const q = text.toLowerCase();
  const tags: string[] = [];

  if (
    q.includes("trade") ||
    q.includes("trading") ||
    q.includes("chart") ||
    q.includes("entry") ||
    q.includes("stop loss") ||
    q.includes("risk") ||
    q.includes("prop firm") ||
    q.includes("evaluation")
  ) {
    tags.push("trading");
  }

  if (
    q.includes("psychology") ||
    q.includes("emotion") ||
    q.includes("fear") ||
    q.includes("revenge") ||
    q.includes("discipline") ||
    q.includes("tilt") ||
    q.includes("mindset") ||
    q.includes("worried") ||
    q.includes("worry") ||
    q.includes("stress") ||
    q.includes("stressed")
  ) {
    tags.push("psychology");
  }

  if (
    q.includes("money") ||
    q.includes("salary") ||
    q.includes("expenses") ||
    q.includes("freedom") ||
    q.includes("worry free") ||
    q.includes("runway") ||
    q.includes("minimum required")
  ) {
    tags.push("money", "freedom");
  }

  if (tags.length === 0) tags.push("general");
  return tags;
}

async function sendTelegramText(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return;
  }

  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );
}

async function sendTelegramVoice(chatId: number, audio: ArrayBuffer) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN for voice send");
    return;
  }

  const form = new FormData();
  form.append("chat_id", String(chatId));

  const blob = new Blob([audio], { type: "audio/ogg" });
  // @ts-ignore Node FormData typing is a bit loose; this works at runtime
  form.append("voice", blob, "jarvis.ogg");

  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
    {
      method: "POST",
      // @ts-ignore Node FormData typing is a bit loose; this works at runtime
      body: form,
    }
  );
}

async function synthesizeTTS(text: string): Promise<ArrayBuffer | null> {
  if (!DEEPGRAM_API_KEY) {
    console.error("Missing DEEPGRAM_API_KEY");
    return null;
  }

  const res = await fetch(
    "https://api.deepgram.com/v1/speak?model=aura-asteria-en",
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
    console.error("Deepgram TTS error:", await res.text());
    return null;
  }

  return await res.arrayBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;

    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userText = message.text;
    const sentAtIso = new Date(
      (message.date ?? Math.floor(Date.now() / 1000)) * 1000
    ).toISOString();

    const supabase = createClient();

    // --- Attempt to update trading memory (preserve old behavior; non-fatal) ---
    try {
      await autoUpdateTradingMemoryFromUtterance(supabase, userText);
    } catch (e) {
      console.error("autoUpdateTradingMemoryFromUtterance error:", e);
    }

    // --- Profile ---
    let profile: any = null;
    try {
      const { data, error } = await supabase
        .from("jarvis_profile")
        .select("*")
        .eq("user_id", "single-user")
        .single();

      if (error) {
        console.error("Error loading jarvis_profile:", error.message);
      } else {
        profile = data;
      }
    } catch (err) {
      console.error("Exception loading jarvis_profile:", err);
    }

    // --- Finance snapshot ---
    const finance = await loadFinance(supabase);

    const timezone: string = profile?.timezone || "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    const displayName = profile?.display_name || "Bro";
    const bio =
      profile?.bio ||
      "Disciplined trader building systems to control impulses and grow steadily.";
    const mainGoal =
      profile?.main_goal ||
      "Become a consistently profitable, rule-based trader.";
    const currentFocus =
      profile?.current_focus || "December: Discipline over profits.";

    const typicalWake = profile?.typical_wake_time || "06:30";
    const typicalSleep = profile?.typical_sleep_time || "23:30";
    const sessionStart = profile?.trading_session_start || "09:15";
    const sessionEnd = profile?.trading_session_end || "15:30";

    const strictness = profile?.strictness_level ?? 8;
    const empathy = profile?.empathy_level ?? 7;
    const humor = profile?.humor_level ?? 5;

    const financeSnippet = buildFinanceContextSnippet(finance);
    const tradingProfile = await loadTradingProfile(supabase);
    const tradingSnippet = buildTradingProfileSnippet(tradingProfile);

    // --- 0) Reminder creation (Telegram) ---
    try {
      const reminderResult = await tryCreateReminderFromText({
        text: userText,
        supabase,
        source: "telegram",
        timezone,
        telegramChatId: chatId,
      });

      if (reminderResult) {
        const reply = reminderResult.confirmation;
        await sendTelegramText(chatId, reply);
        const audio = await synthesizeTTS(reply);
        if (audio) await sendTelegramVoice(chatId, audio);

        // Also save confirmation to history (preserve OLD behavior)
        try {
          await saveHistoryPair({
            supabase,
            channel: "telegram",
            userText,
            assistantText: reply,
          });
        } catch (e) {
          console.error("Error saving reminder confirmation to history:", e);
        }

        return NextResponse.json({ ok: true });
      }
    } catch (e) {
      console.error("tryCreateReminderFromText error:", e);
    }

    // --- 0.1) Time questions (no LLM) ---
    if (isTimeQuestion(userText)) {
      const replyRaw = `It's currently ${nowInfo.timeString} in our local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;
      const reply = stripSentAtPrefix(replyRaw);

      await sendTelegramText(chatId, reply);
      const audio = await synthesizeTTS(reply);
      if (audio) await sendTelegramVoice(chatId, audio);

      try {
        await saveHistoryPair({
          supabase,
          channel: "telegram",
          userText,
          assistantText: reply,
        });
      } catch (e) {
        console.error("Error saving time reply to history:", e);
      }

      return NextResponse.json({ ok: true });
    }

    // --- 0.2) Percent-of-target questions: deterministic math only ---
    const percentQuestionIntent =
      !!userText &&
      (
        /\bhow (much|many)\b/i.test(userText) ||
        /\bwhat(?:'s| is)? the? (percent|%)/i.test(userText) ||
        /\bhow (far|close)\b.*\b(target|goal)\b/i.test(userText) ||
        /\bpercent\b/i.test(userText) ||
        userText.trim().endsWith("?")
      );

    if (percentQuestionIntent && isPercentOfTargetQuestion(userText)) {
      const reply = buildPercentOfTargetAnswerFromText(userText);
      if (reply) {
        await sendTelegramText(chatId, reply);
        const audio = await synthesizeTTS(reply);
        if (audio) await sendTelegramVoice(chatId, audio);

        try {
          await saveHistoryPair({
            supabase,
            channel: "telegram",
            userText,
            assistantText: reply,
          });
        } catch (e) {
          console.error("Error saving percent answer to history:", e);
        }

        return NextResponse.json({ ok: true });
      }
    }

    // --- 1) Build Knowledge Center context from your Data Center ---
    const intentTags = detectIntentTags(userText);
    const knowledgeBlocks = await buildKnowledgeContext({
      intentTags,
      maxItems: 8,
    });

    const knowledgeSection =
      knowledgeBlocks.length === 0
        ? "No explicit user knowledge has been defined yet."
        : knowledgeBlocks
            .map(
              (b) => `
### ${b.title} [${b.item_type}, importance ${b.importance}]
${b.content}

${
  b.instructions
    ? `How Jarvis must use this:\n${b.instructions}\n`
    : ""
}`
            )
            .join("\n");

    // --- 2) Tone engine + style preferences for Telegram (preserve OLD behavior) ---
    const toneMode = detectToneMode(userText || "", "telegram");
    const toneDirective = buildToneDirective(toneMode, "telegram");

    const styleBlock = `
[User style preferences - Telegram]
- This channel is for quick, natural conversation.
- Short texts like "Bro", "Ok", "Yup" should get short, casual replies, not lectures.
- Use casual language, call him "Bro", and feel like a real friend.
- Only go deep or long when he writes something longer, emotional, or explicitly asks.
- When summarizing or listing things about him, avoid "*" star bullets unless he asks; use numbered lists or simple dashes.
`;

    // --- 2.5) Load recent shared history (web + telegram) (preserve OLD behavior) ---
    let historyMessages: { role: "user" | "assistant"; content: string }[] = [];
    try {
      const recentHistory = await loadRecentHistory({
        supabase,
        userId: "single-user",
        limit: 10,
      });

      historyMessages = recentHistory.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      }));
    } catch (e) {
      console.error("Error loading recent history:", e);
      historyMessages = [];
    }

    // --- 3) Build system prompt: profile + finance + time + knowledge + protocol ---
    const systemPrompt = `
${toneDirective}
${styleBlock}

You are Jarvis, a long-term trading & life companion for ONE user, talking over Telegram.

USER ID: "single-user"

User identity:
- Name you call him: ${displayName}
- Bio: ${bio}
- Main goal: ${mainGoal}
- Current focus: ${currentFocus}

User routine:
- Timezone: ${timezone}
- Typical wake time: ${typicalWake}
- Typical sleep time: ${typicalSleep}
- Trading session: ${sessionStart} - ${sessionEnd}

Personality sliders (0–10):
- Strictness: ${strictness}
- Empathy: ${empathy}
- Humor: ${humor}

Current time (FOR INTERNAL REASONING ONLY, DO NOT SAY THIS UNLESS THE USER ASKS ABOUT TIME):
- ISO: ${nowInfo.iso}
- Local: ${nowInfo.localeString}
- Timezone: ${nowInfo.timezone}

[sent_at: ...] TAG:
- The user text may be wrapped as:
  [sent_at: 2025-12-07T08:22:54.281Z] actual text...
- This is METADATA ONLY. Use it to infer how long it's been since the last message.
- NEVER print the [sent_at: ...] tag or raw ISO timestamps.
- DO NOT invent your own [sent_at: ...] prefix in replies.

${financeSnippet}

${tradingSnippet}

USER TEACHINGS (KNOWLEDGE CENTER):
The user has manually defined the following rules, concepts, formulas, and stories.
These are HIGH PRIORITY and should guide your answers. Obey them unless they clearly conflict with basic logic or math or the laws of reality.

${knowledgeSection}

CONVERSATION & LISTENING (TELEGRAM):

1) Short, casual messages:
   - If the user sends a one- or two-word message ("Bro", "Okay", "Yup", etc.), reply in a very short, casual way.
   - Ask a small follow-up question only when he clearly opens a topic. Do NOT start a long lecture.

2) If the user replies with a short negation like "no", "nope", "that's not what I meant":
   - Do NOT lecture.
   - Ask a brief clarifying question to understand exactly what they meant.

3) For trading/math questions where the server has NOT already calculated the result:
   - Listen carefully, restate key numbers briefly, then answer.
   - If the user corrects you ("you're wrong bro"), apologize briefly, restate their numbers, and recompute carefully.
   - Keep coaching short and specifically tied to the numbers they gave you.

4) Coaching style:
   - Strict but caring. Discipline over random trades.
   - Use the finance snapshot and trading memory when he talks about risk, capital, or feeling rushed.
   - Avoid generic speeches; stay tightly connected to his actual question and context.

MATH & LISTENING PROTOCOL (STRICT):
- ALWAYS extract the key numbers the user gives and answer with raw calculation first, followed by a tiny breakdown and optional short coaching.
`.trim();

    const userMessageForModel = `[sent_at: ${sentAtIso}] ${userText}`;

    // --- 4) Call Groq LLM for normal chat path ---
    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userMessageForModel },
      ],
      stream: false,
    });

    const rawReply =
      completion.choices?.[0]?.message?.content || "Got it, Bro.";

    const replyText = stripSentAtPrefix(rawReply);

    await sendTelegramText(chatId, replyText);

    const audio = await synthesizeTTS(replyText);
    if (audio) await sendTelegramVoice(chatId, audio);

    // --- Save to shared history (preserve OLD behavior) ---
    try {
      await saveHistoryPair({
        supabase,
        channel: "telegram",
        userText: userMessageForModel,
        assistantText: replyText,
      });
    } catch (e) {
      console.error("Error saving chat reply to history:", e);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TELEGRAM WEBHOOK ERROR:", err);
    return NextResponse.json({ ok: true });
  }
}
