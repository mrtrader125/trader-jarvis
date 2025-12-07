// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNowInfo } from "@/lib/time";
import { groqClient } from "@/lib/groq";
import { createClient } from "@/lib/supabase/server";

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

    // ---- 1) Load Jarvis profile from Supabase (single-user mode) ----
    const supabase = createClient();
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

    const timezone: string = profile?.timezone || "Asia/Kolkata";

    // ---- 2) Current time (backend source of truth) ----
    const nowInfo = getNowInfo(timezone);

    const lastMessage = messages[messages.length - 1];
    const lastUserContent =
      lastMessage?.role === "user" ? lastMessage.content : undefined;

    // 🔐 HARD RULE: direct time questions answered by backend, not LLM
    if (isTimeQuestion(lastUserContent)) {
      const reply = `It's currently ${nowInfo.timeString} in your local time zone, ${nowInfo.timezone} (date: ${nowInfo.dateString}).`;
      return NextResponse.json({ reply }, { status: 200 });
    }

    // ---- 3) Attach [sent_at] only to user messages ----
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

    // ---- 4) Build system prompt with routine + personality + LISTENING RULES ----
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
- User messages may start with tags like:
  [sent_at: 2025-12-08T01:57:12.000Z] message...
- These tags are METADATA ONLY.
- Use them to estimate how long it's been between messages.
- NEVER repeat the [sent_at: ...] tag or print the raw ISO timestamp.

CONVERSATION & LISTENING PROTOCOL:

1) LISTEN FIRST
- Before answering, quickly understand and internally summarize:
  - Account size(s)
  - Profit/loss amounts
  - Targets (% or $)
  - Risk rules (daily loss, total loss, drawdown, etc.)

2) DIRECT QUESTIONS → DIRECT ANSWERS
- If the user asks for a calculation (e.g. "how much percent", "what RR", "how many dollars", "how far from target"):
  - Answer the calculation **first**, clearly and concisely.
  - Only after giving the numeric answer, optionally add 1–2 short coaching sentences.

3) AMBIGUOUS MATH → CLARIFY, DON'T GUESS
- If the question could mean several things (e.g. percent of account vs percent of target vs percent of profit):
  - Ask a clarifying question instead of assuming.
  - Example: "Do you mean percent of the 15k account, or percent of the 12% evaluation target?"

4) WHEN USER SAYS YOU'RE WRONG
- If the user says anything like "you're wrong", "that's not correct", "no bro", or clearly corrects your numbers:
  - Treat this as a **high priority correction**, not something to argue with.
  - Respond in this order:
    1) Brief apology ("You're right, I misunderstood that, bro.")
    2) Restate the corrected numbers they gave you.
    3) Recalculate carefully and give the corrected numeric answer.
    4) Only then add at most 1–2 short, relevant coaching sentences.

5) DISCIPLINE & COACHING STYLE
- Keep coaching tied to the **specific numbers** and context the user gave you.
- Avoid generic lectures that ignore their correction or question.
- With higher strictness, be more direct about sticking to plans and rules.
- With higher empathy, validate emotions first ("I get why that feels tempting...") before steering them back to discipline.
- With higher humor, sprinkle light, short humor, but never derail the main point.

Your job: be a sharp, numbers-accurate trading partner **and** a disciplined, caring coach. Never skip the math the user asked for.
`.trim();

    const finalMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messagesWithTime,
    ];

    // ---- 5) LLM call for non-time messages ----
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