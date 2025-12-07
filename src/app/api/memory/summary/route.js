// src/app/api/memory/summary/route.js
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { PRIMARY_USER_ID } from "@/lib/constants";
import {
  supabase,
  hasSupabase,
  getRecentMemories,
  getUserProfileSummary,
  upsertUserProfileSummary,
} from "@/lib/supabase";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const GROQ_MODEL =
  process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ---------------------------------------------------------------------
// GET /api/memory/summary
// Manually or via cron: refresh long-term profile summary
// AND trigger /api/journal/daily in the background.
// ---------------------------------------------------------------------
export async function GET() {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "NO_API_KEY" },
        { status: 500 }
      );
    }

    if (!hasSupabase || !supabase) {
      return NextResponse.json(
        {
          ok: false,
          error: "NO_SUPABASE",
          debug: {
            hasSupabase,
            url: !!process.env.SUPABASE_URL,
            serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          },
        },
        { status: 500 }
      );
    }

    const userId = PRIMARY_USER_ID;

    // 1) Existing long-term profile (string summary)
    const existingSummary = await getUserProfileSummary(userId);

    // 2) Recent memories (bigger slice than chat)
    const recentMemories = await getRecentMemories({
      userId,
      limit: 100,
    });

    if (!recentMemories.length && !existingSummary) {
      return NextResponse.json({
        ok: true,
        message: "No memories yet. Nothing to summarise.",
      });
    }

    const memoriesText = recentMemories
      .map(
        (m) =>
          `[${m.created_at}] (${m.channel}/${m.type}) ${m.content ?? ""}`
      )
      .reverse()
      .join("\n");

    const systemPrompt = `
You are the **memory compression system** for Jarvis, an AI trading & life companion.

Your job:
- Take the user's past memories and compress them into a **single, evolving profile summary**.
- This summary should help Jarvis understand the trader as a person over time.

The summary MUST include:
1. Personality & mindset traits (especially around trading & discipline).
2. Emotional patterns (tilt, FOMO, revenge trading, avoidance, overthinking, etc.).
3. Trading style & process (timeframes, behaviour, habits).
4. Strengths (what the trader does well).
5. Weaknesses / recurring mistakes.
6. Current goals & focus.
7. Any important life context that keeps showing up.
8. Guidance for Jarvis on how to talk to and guide this person effectively.

Rules:
- Write in third person ("he") to describe him.
- Keep it concise but rich (around 400–800 words).
- DO NOT list every trade. Focus on patterns.
- Preserve useful knowledge from the **existing summary** if it is still true.
- If something in the old summary is clearly outdated or contradicted by new evidence, update it.
`;

    const userPrompt = `
Here is the **existing long-term summary** (can be empty):

---
${existingSummary || "(no existing summary yet)"}
---

Here are **recent raw memories** from Supabase:

---
${memoriesText || "(no recent memories)"}
---

Now produce a **new, updated long-term summary** following the rules.
`;

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    });

    const newSummary =
      completion.choices?.[0]?.message?.content?.trim();

    if (!newSummary) {
      return NextResponse.json(
        {
          ok: false,
          error: "EMPTY_SUMMARY",
          message: "Model did not return a summary.",
        },
        { status: 500 }
      );
    }

    // 3) Save new long-term profile
    await upsertUserProfileSummary(newSummary, userId);

    // 4) Fire-and-forget: also trigger daily journal
    //    Uses either JARVIS_BASE_URL or VERCEL_URL
    const baseUrl =
      process.env.JARVIS_BASE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : null);

    if (baseUrl) {
      try {
        // Don't await the response for too long – just trigger it.
        fetch(`${baseUrl}/api/journal/daily`).catch((err) => {
          console.error(
            "Failed to trigger /api/journal/daily from summary:",
            err
          );
        });
      } catch (err) {
        console.error(
          "Error scheduling /api/journal/daily from summary:",
          err
        );
      }
    } else {
      console.warn(
        "No base URL set (JARVIS_BASE_URL or VERCEL_URL); daily journal not auto-triggered."
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        "Profile summary updated (and daily journal triggered if base URL is configured).",
      length: newSummary.length,
    });
  } catch (err) {
    console.error("/api/memory/summary error:", err);

    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      String(err);

    return NextResponse.json(
      {
        ok: false,
        error: "SUMMARY_ERROR",
        message,
      },
      { status: 500 }
    );
  }
}
