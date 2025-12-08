// src/app/api/chat/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groqClient } from "@/lib/groq";
import { getNowInfo } from "@/lib/time";
import {
  isPercentOfTargetQuestion,
  buildPercentOfTargetAnswerFromText,
} from "@/lib/jarvis/math";
import { loadFinance, buildFinanceContextSnippet } from "@/lib/jarvis/finance";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: string;
  created_at?: string;
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: ChatMessage[] = body?.messages ?? [];

    const supabase = createClient();

    // --- Load profile ---
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

    // --- Load finance snapshot ---
    const finance = await loadFinance(supabase);

    const timezone: string = profile?.timezone || "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    const lastMessage = messages[messages.length - 1];
    const lastUserContent =
      lastMessage?.role === "user" ? lastMessage.content : undefined;

    // --- 0) Pure time questions: handled in backend, NOT LLM ---
    if (isTimeQuestion(lastUserContent)) {
      const reply = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;
      return NextResponse.json({ reply }, { status: 200 });
    }

    // --- 0.5) "How much percent of target" questions: backend math only ---
    if (lastUserContent && isPercentOfTargetQuestion(lastUserContent)) {
      const answer = buildPercentOfTargetAnswerFromText(lastUserContent);
      if (answer) {
        return NextResponse.json({ reply: answer }, { status: 200 });
      }
    }

    // --- 1) Tag user messages with [sent_at: ...] for temporal reasoning ---
    const messagesWithTime = messages.map((m) => {
      const sentAt =
        m.createdAt ||
        m.created_at ||
        new Date().toISOString();

      if (m.role === "user") {
        return {
          role: m.role,
          content: `[sent_at: ${sentAt}] ${m.content}`,
        };
      }

      return {
        role: m.role,
        content: m.content,
      };
    });

    // --- 2) Build Jarvis system prompt with profile + finance + time ---
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

    const systemPrompt = `
You are Jarvis, a long-term trading & life companion for ONE user in SINGLE-USER mode.

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

[sent_at: ...] TAGS:
- User messages may start with [sent_at: ISO_DATE] at the front.
- This is metadata only. Use it to infer how long it's been since the last message.
- NEVER print the [sent_at: ...] tag or raw ISO timestamps back to the user.

${financeSnippet}

CONVERSATION & LISTENING:

1) If the user replies with a short negation like "no", "nope", "that's not what I meant":
   - Do NOT lecture.
   - Ask a brief clarifying question to understand exactly what they meant.

2) For general trading/math questions where the server has NOT already calculated the result:
   - Listen carefully, restate key numbers briefly, then answer.
   - If the user corrects you ("you're wrong bro"), apologize briefly, restate their numbers, and recompute carefully.
   - Keep coaching short and specifically tied to the numbers they gave you.

3) Coaching style:
   - Strict but caring. Discipline over random trades.
   - Use the finance snapshot when he talks about risk, capital, or feeling rushed.
   - For example, remind him that a calm monthly return close to his "safe monthly return percent"
     can already cover his living costs, so he doesn't need to gamble today.
   - Avoid generic speeches; stay tightly connected to his actual question and context.
`.trim();

    const finalMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messagesWithTime,
    ];

    // --- 3) Call Groq LLM for normal chat path ---
    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: finalMessages,
      stream: false,
    });

    const replyMessage = completion.choices?.[0]?.message as any;

    const replyContent =
      typeof replyMessage?.content === "string"
        ? replyMessage.content
        : Array.isArray(replyMessage?.content)
        ? replyMessage.content
            .map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
            .join("\n")
        : "Sorry, I couldn't generate a response.";

    return NextResponse.json({ reply: replyContent }, { status: 200 });
  } catch (error: unknown) {
    console.error("CHAT API ERROR:", error);
    const message =
      error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { reply: "Jarvis brain crashed: " + message },
      { status: 200 }
    );
  }
}
