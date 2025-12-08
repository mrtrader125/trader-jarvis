// trader-jarvis/src/app/api/chat/route.ts

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

/**
 * Very simple tag detector for the Knowledge Center.
 * This decides which knowledge items are most relevant for this question.
 */
function detectIntentTags(text: string | undefined): string[] {
  if (!text) return ["general"];
  const q = text.toLowerCase();
  const tags: string[] = [];

  if (
    q.includes("trade") ||
    q.includes("trading") ||
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
    q.includes("mindset")
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

    // --- 2) Build Knowledge Center context (your manual teachings) ---
    const intentTags = detectIntentTags(lastUserContent);
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

    // --- 3) Build Jarvis system prompt with profile + finance + time + knowledge ---
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

USER TEACHINGS (KNOWLEDGE CENTER):
The user has manually defined the following rules, concepts, formulas, and stories.
These are HIGH PRIORITY and should guide your answers. Obey them unless they clearly conflict with basic logic or math.

${knowledgeSection}

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

MATH & LISTENING PROTOCOL (STRICT):

1) ALWAYS extract the key numbers the user gives:
   - account size(s)
   - profit/loss amounts
   - target percentages
   - evaluation rules (daily max loss, total max loss, target, etc.)

2) DIRECT QUESTIONS REQUIRE DIRECT ANSWERS:
   - If the user gives numbers or asks "how much", "how many", 
     "what percent", "how far from target", ALWAYS answer with the 
     raw calculation FIRST.
   - Format answers like this:
       • Result summary (1 line)
       • Tiny breakdown (1–2 lines max)
       • Then OPTIONAL coaching (1 line max)

3) NEVER GUESS NUMBERS.
   - If something is unclear, ask ONE clarifying question.
   - DO NOT assume the initial capital if the user did not say it.

4) WHEN THE USER PROVIDES A CORRECTION:
   - Immediately apologize briefly.
   - Restate the corrected numbers.
   - Recalculate CORRECTLY.
   - Provide the clean updated answer BEFORE ANY coaching.

5) COACHING RULE:
   - Coaching must always come AFTER the numeric answer.
   - Coaching must be short (1–2 lines max).
   - Coaching MUST relate directly to the user's numbers and goal.
   - DO NOT give generic lectures.

6) STRICT PRIORITY ORDER:
   (1) Listen and extract numbers  
   (2) Compute  
   (3) Present result  
   (4) Optional coaching  

Your job: be a sharp, numbers-accurate trading partner AND a disciplined, caring coach.
Use the Knowledge Center rules as the user's personal doctrine whenever relevant.
`.trim();

    const finalMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messagesWithTime,
    ];

    // --- 4) Call Groq LLM for normal chat path ---
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
