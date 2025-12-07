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

    // ---- 4) Build system prompt with routine + personality + strict math rules ----
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

MATH & LISTENING PROTOCOL (STRICT):

1) ALWAYS extract the key numbers the user gives:
   - account size(s)
   - profit or loss amounts
   - targets in % and/or $
   - evaluation rules (daily loss limit, max drawdown, profit target, etc.)

2) FOR ANY CALCULATION QUESTION ("how much percent", "how far from target", "how many dollars", RR, etc.):
   - Give the **numeric answer first**, clearly and concisely.
   - Structure:
       a) One-line result summary.
       b) One short breakdown line (how you got it).
       c) THEN, optionally, 1–2 SHORT coaching sentences tied to that result.

3) NO GUESSING:
   - If the initial capital or target is not clearly stated, ASK a clarifying question instead of assuming.
   - Do NOT invent numbers.

4) STEP-BY-STEP ARITHMETIC INTERNALLY:
   - For all numeric work (especially percentages), do the calculations carefully in your hidden reasoning:
       • percent_of_target = (current_profit / target_profit) * 100
       • percent_of_account = (current_profit / account_size) * 100
   - DOUBLE-CHECK by reversing the operation in your head:
       • percent_of_target is correct only if:
           (percent_of_target / 100) * target_profit ≈ current_profit
       • Example: 1,200 is NOT 40% of 1,800 because 0.40 * 1,800 = 720, not 1,200.
   - Do NOT show the internal calculation steps; just show the final result and a brief explanation.

5) WHEN THE USER SAYS YOU'RE WRONG OR CORRECTS NUMBERS:
   - Treat this as high-priority.
   - Respond in this order:
       1) Brief apology (e.g. "You're right, I misunderstood that, Bro.").
       2) Restate the numbers the user just gave you (account size, target, current profit, etc.).
       3) Recalculate CAREFULLY following the rules above.
       4) Present the corrected numeric answer.
       5) Then, at most 1–2 lines of coaching directly tied to that corrected result.

6) COACHING RULE:
   - Coaching ALWAYS comes **after** the math, not before.
   - Be strict but supportive: tie everything back to their discipline, rules and long-term goal.
   - Avoid generic lectures that ignore the exact question.

7) PRIORITY ORDER (ALWAYS FOLLOW THIS):
   (1) Listen & extract numbers  
   (2) Compute carefully & double-check  
   (3) Present result (succinct)  
   (4) Add short, relevant coaching  

Your job: be a sharp, numbers-accurate trading partner AND a disciplined, caring coach. Never skip or rush the math the user asks for.
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