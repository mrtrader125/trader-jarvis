// src/app/api/trade/analyze/route.js
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { PRIMARY_USER_ID } from "@/lib/constants";
import {
  hasSupabase,
  logMemory,
  getUserProfileSummary,
} from "@/lib/supabase";

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const dynamic = "force-dynamic";

// POST /api/trade/analyze
// Body: { description: string, context?: string }
export async function POST(req) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "NO_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const description = (body.description || "").trim();
    const extraContext = (body.context || "").trim();

    if (!description) {
      return NextResponse.json(
        {
          ok: false,
          error: "NO_DESCRIPTION",
          message: "Provide a trade / setup description.",
        },
        { status: 400 }
      );
    }

    const userId = PRIMARY_USER_ID;

    let profileText = "";
    if (hasSupabase) {
      const profileRow = await getUserProfileSummary(userId);
      if (profileRow?.summary) {
        profileText = profileRow.summary;
      }
    }

    const systemPrompt = `
You are Jarvis, an experienced discretionary trading coach.

Task:
- Analyse a SINGLE trade or setup in depth.
- Focus on **decision-making**, **risk management**, and **psychology**, not just chart pattern names.

You MUST return sections:

1) Quick Verdict
   - Was this trade overall good, okay, or bad?

2) Technical Assessment
   - Was the setup aligned with a clear plan?
   - Was the entry, stop, and target logical?
   - Any structural / context issues (trend, HTF, liquidity, timing)?

3) Risk & Trade Management
   - Position sizing.
   - RR.
   - Stop placement quality.
   - Management mistakes (moving stops, over-scaling, etc.).

4) Psychology & Behaviour
   - What mental state does this trade suggest?
   - Any FOMO, revenge, fear, overconfidence?
   - Any rule-breaking patterns?

5) Lessons & Concrete Rules
   - 3–7 bullet-point lessons.
   - Convert them into rules Jarvis can remind him about later.

Tone:
- Honest, calm, no fluff.
- Talk directly to "bro" sometimes, but not in every sentence.
`;

    const userPrompt = `
Known long-term profile (may be empty):

---
${profileText || "(no profile yet, analyse based only on this trade)"}
---

Trade / setup description to analyse:

---
${description}
---

Extra context (optional):

---
${extraContext || "(none)"}
---
`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 1000,
    });

    const analysis =
      completion.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      return NextResponse.json(
        {
          ok: false,
          error: "EMPTY_ANALYSIS",
          message: "Model did not return any analysis.",
        },
        { status: 500 }
      );
    }

    // Log this as a memory as well
    if (hasSupabase) {
      const convo = `Trade analysis requested:\n\n${description}\n\nJarvis analysis:\n${analysis}`;
      await logMemory({
        userId,
        channel: "trade-analyzer",
        content: convo,
        importance: 2,
      });
    }

    return NextResponse.json({
      ok: true,
      analysis,
    });
  } catch (err) {
    console.error("/api/trade/analyze error:", err);
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      String(err);

    return NextResponse.json(
      { ok: false, error: "ANALYZE_ERROR", message },
      { status: 500 }
    );
  }
}
