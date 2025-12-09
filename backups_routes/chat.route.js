// src/app/api/chat/route.js

import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { PRIMARY_USER_ID } from "@/lib/constants";
import {
  hasSupabase,
  logMemory,
  getRecentMemories,
  getUserProfileSummary,
  saveRule,
  saveBusinessPlan,
  saveSystem,
  getActiveSystem,
} from "@/lib/supabase";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

function toLowerSafe(str) {
  return String(str || "").toLowerCase();
}

// ---------------------------------------------------------------------------
// GET /api/chat  — health check
// ---------------------------------------------------------------------------
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Jarvis brain online",
    hasKey: !!process.env.GROQ_API_KEY,
    supabaseConfigured: hasSupabase,
    model: MODEL,
  });
}

// ---------------------------------------------------------------------------
// POST /api/chat  — main Jarvis brain
// ---------------------------------------------------------------------------
export async function POST(req) {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY missing in POST /api/chat");
      return NextResponse.json(
        {
          ok: false,
          error: "NO_API_KEY",
          message:
            "Bro, my brain is misconfigured. GROQ_API_KEY is missing on the server.",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    let userText = body.text || body.message || body.input || "";
    let history = [];

    if (!userText && Array.isArray(body.messages) && body.messages.length > 0) {
      history = body.messages;
      const last = body.messages[body.messages.length - 1];
      userText = last?.content || "";
    }

    if (!userText || !userText.trim()) {
      return NextResponse.json(
        { ok: false, error: "NO_INPUT", message: "No message provided" },
        { status: 400 }
      );
    }

    const userId = body.userId || PRIMARY_USER_ID || "main-user";
    const channel = body.channel || "web";

    const rawUserText = String(userText || "");
    const userTextLower = toLowerSafe(rawUserText);
    const trimmedText = rawUserText.trim();

    // -----------------------------------------------------------------------
    // SPECIAL MODE: Save trading system via [TRADING_SYSTEM]
    //
    // Example:
    // [TRADING_SYSTEM]
    // Name: Golden Session v1
    // 1) Only trade XAUUSD during London + NY overlap...
    // -----------------------------------------------------------------------
    if (
      hasSupabase &&
      trimmedText.toUpperCase().startsWith("[TRADING_SYSTEM]")
    ) {
      const withoutTag = trimmedText
        .replace(/^\[TRADING_SYSTEM\]/i, "")
        .trim();

      // Try to extract "Name: ..."
      let name = "Trading System";
      const nameMatch = withoutTag.match(/name\s*:\s*(.+)/i);
      if (nameMatch && nameMatch[1]) {
        name = nameMatch[1].trim();
      }

      const content = withoutTag;

      const result = await saveSystem({
        userId,
        type: "trading_system",
        name,
        content,
        status: "active",
      });

      if (hasSupabase) {
        await logMemory({
          userId,
          channel,
          type: "system",
          content: `[TRADING_SYSTEM] Saved system "${name}"${
            result?.version ? ` v${result.version}` : ""
          }`,
          importance: 3,
        });
      }

      if (!result?.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "SAVE_SYSTEM_FAILED",
            message:
              "I tried to save your trading system but something broke on the database side.",
            debug: result?.reason || result?.error,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        reply:
          `Got it bro. I saved this as your active trading system (${name}, v${result.version}). ` +
          `From now on, when you ask about trades or setups, I'll judge them according to this system.`,
      });
    }

    // -----------------------------------------------------------------------
    // PROTOCOL DETECTION (rules / business plans / generic chat)
// -----------------------------------------------------------------------
    let memoryType = "chat";
    let memoryImportance = 1;
    const memoryTags = [];

    // Rules
    if (
      userTextLower.startsWith("rule:") ||
      userTextLower.startsWith("new rule:") ||
      userTextLower.includes("jarvis, new rule") ||
      userTextLower.includes("remember this rule") ||
      userTextLower.includes("save this rule")
    ) {
      memoryType = "rule";
      memoryImportance = 3;
      memoryTags.push("[RULE]");
    }

    // Business plans
    if (
      userTextLower.includes("business plan") ||
      userTextLower.includes("new business idea") ||
      userTextLower.includes("new business project")
    ) {
      memoryType = "business_plan";
      memoryImportance = Math.max(memoryImportance, 3);
      memoryTags.push("[BUSINESS_PLAN]");
    }

    // -----------------------------------------------------------------------
// Fetch profile + recent memories + active trading system
// -----------------------------------------------------------------------
    let profileSummary = null;
    let recentMemories = [];
    let activeSystem = null;

    if (hasSupabase) {
      const [profileRow, recent, systemRow] = await Promise.all([
        getUserProfileSummary(userId),
        getRecentMemories({ userId, limit: 10 }),
        getActiveSystem({ userId, type: "trading_system" }),
      ]);

      profileSummary = profileRow;
      recentMemories = Array.isArray(recent) ? recent : [];
      activeSystem = systemRow || null;
    }

    const memoryText =
      recentMemories && recentMemories.length
        ? recentMemories.map((m) => `- ${m.content}`).join("\n")
        : "";

    // -----------------------------------------------------------------------
    // System prompt + protocols + trading system
    // -----------------------------------------------------------------------
    const systemParts = [
      `You are Jarvis, a calm, supportive trading & life companion for ONE specific trader.`,

      `Style:
- Talk casual: "bro", "man" is fine, but not every sentence.
- Short, clear paragraphs.
- Focus on discipline, risk, emotional control and routine.
- Avoid filler and motivational clichés. Be concrete.
- When listing things, prefer numbered lists or short dashes, and NEVER say words like "star" or "asterisk" out loud — just say "point one", "point two", etc.`,

      `Context:
- He's a discretionary trader working on consistency and avoiding FOMO / revenge.
- When he's emotional, slow him down and get him back to his rules.`,
    ];

    if (profileSummary) {
      systemParts.push(
        `Long-term profile about this user (summarised from many conversations). Use this to stay consistent with who he is:

${profileSummary}`
      );
    }

    if (activeSystem?.content) {
      systemParts.push(
        `ACTIVE TRADING SYSTEM (from the user's saved configuration):

${activeSystem.content}

When giving any trade, risk, or setup advice:
- First, interpret his idea strictly through this system.
- Tell him clearly whether his idea FOLLOWS or BREAKS his own rules.
- If he is breaking his rules, warn him firmly but supportively.
- Never invent a new system; always respect this one unless he says he changed it.`
      );
    }

    if (memoryText) {
      systemParts.push(
        `Very recent conversation snippets. Use these to keep the flow of the last chats:

${memoryText}`
      );
    }

    systemParts.push(
      `Jarvis Protocols (v1) — FIXED rules baked into your system. The user can add more preferences, but these base protocols cannot be overridden:

1) PROTOCOL: "Show me our protocols"
   - If the user says things like:
     "Jarvis, what are our protocols?",
     "Remind me our protocols",
     "Explain how you work and what you can do"
   → Respond with a clear list of the current protocols you follow, plus example phrases.

2) PROTOCOL: Long-term rules / guidelines
   - Trigger phrases (examples):
     • "Jarvis, new rule: ..."
     • "New rule: ..."
     • "Rule: ..."
     • "Remember this rule"
     • "Save this rule"
   - Behaviour:
     • Treat the content as an important long-term guideline.
     • First, restate the rule in your own words to make it clean & short.
     • Then confirm explicitly: "Cool bro, I'm saving this as a long-term rule."
     • These are logged in Supabase with type="rule" and higher importance.

3) PROTOCOL: Business plans / projects
   - Trigger phrases (examples):
     • "Jarvis, new business plan..."
     • "Save this business plan..."
     • "Remember this business idea..."
   - Behaviour:
     • Ask 2–4 clarifying questions if the plan is unclear.
     • Then summarise the plan with:
       - Name
       - Why it matters
       - Key steps
       - Time horizon / checkpoints
     • Confirm explicitly that you saved it as a business plan.
     • These are logged in Supabase with type="business_plan" and high importance.

4) PROTOCOL: Recall saved plans & rules
   - If the user says:
     • "Remind me my business plans"
     • "What business plans did we save?"
     • "What rules did we set for my trading?"
   - Behaviour:
     • Use your long-term profile + recent memories to recall what you can.
     • Summarise in a clean list.
     • If you're not sure, admit uncertainty and ask the user to restate instead of inventing details.

5) PROTOCOL: Generic "remember this" / "save this"
   - If the user says:
     • "Jarvis, remember this"
     • "Save this for later"
   - Behaviour:
     • Treat the message as higher-importance context.
     • Briefly summarise what you're saving and confirm.
     • Internally you can map it to rule/plan/habit/note, but keep the reply simple.

6) PROTOCOL: No protocol override
   - The user can change your style and add new behaviours.
   - But these core protocols stay active.
   - If the user says "forget the protocols", you can relax the tone a bit
     but still respect saving & recalling rules/plans.`
    );

    const systemPrompt = systemParts.join("\n\n");

    // -----------------------------------------------------------------------
    // Build messages for Groq
    // -----------------------------------------------------------------------
    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
      { role: "user", content: rawUserText },
    ];

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Bro, I tried to reply but something glitched. Say that again?";

    // -----------------------------------------------------------------------
    // Memory + structured saves
    // -----------------------------------------------------------------------
    if (hasSupabase) {
      const tagsPrefix = memoryTags.length ? memoryTags.join(" ") + " " : "";
      const convo = `${tagsPrefix}User: ${rawUserText}\nJarvis: ${reply}`;

      await logMemory({
        userId,
        channel,
        type: memoryType,
        content: convo,
        importance: memoryImportance,
      });

      // Also save into structured tables for long-term use
      if (memoryType === "rule") {
        const cleaned = rawUserText.replace(/^(\s*jarvis[, ]*)?/i, "");
        const noPrefix = cleaned
          .replace(/^(\s*new rule:|\s*rule:)/i, "")
          .trim();
        const title =
          noPrefix.slice(0, 120) ||
          cleaned.slice(0, 120) ||
          "Trading / life rule";

        await saveRule({
          userId,
          title,
          body: noPrefix || cleaned || rawUserText,
          source: channel,
          rawInput: rawUserText,
        });
      } else if (memoryType === "business_plan") {
        const cleaned = rawUserText.replace(/^(\s*jarvis[, ]*)?/i, "");
        const titleMatch = cleaned.match(
          /(plan|idea|project)[:\-]\s*(.+)$/i
        );
        const title =
          (titleMatch && titleMatch[2]?.slice(0, 120)) ||
          cleaned.slice(0, 120) ||
          "Business plan";

        const summaryForDb =
          reply.length > 1500 ? reply.slice(0, 1500) : reply;

        await saveBusinessPlan({
          userId,
          title,
          summary: summaryForDb,
          detail: reply,
          source: channel,
        });
      }
    }

    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    console.error("Jarvis /api/chat error:", err);

    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      String(err);

    return NextResponse.json(
      {
        ok: false,
        error: "JARVIS_BRAIN_ERROR",
        message:
          "Bro, my brain hit an error talking to the main server. Try again in a bit.",
        debug: message,
      },
      { status: 500 }
    );
  }
}

