// src/app/api/journal/daily/route.js
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { PRIMARY_USER_ID } from "@/lib/constants";
import {
  hasSupabase,
  supabase,
  getMemoriesSince,
  logJournalEntry,
  getUserProfileSummary,
} from "@/lib/supabase";

const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const dynamic = "force-dynamic";

// GET /api/journal/daily
// Summarise last 24h of jarvis_memory into jarvis_journal
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
        { ok: false, error: "NO_SUPABASE" },
        { status: 500 }
      );
    }

    const userId = PRIMARY_USER_ID;

    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const memories = await getMemoriesSince({
      userId,
      since,
      limit: 500,
    });

    if (!memories.length) {
      return NextResponse.json({
        ok: true,
        message: "No memories in last 24h. Nothing to journal.",
      });
    }

    const existingProfile = await getUserProfileSummary(userId);

    const formatted = memories
      .map(
        (m) =>
          `[${m.created_at}] (${m.channel}) ${m.content ?? ""}`
      )
      .join("\n");

    const systemPrompt = `
You are Jarvis' **daily journal engine**.

Goal:
- Turn the last 24h of raw conversation logs into a single, useful daily journal entry.
- The journal is for a discretionary trader working on discipline and emotional control.

The journal MUST include:
- Overall emotional tone today.
- Key trading decisions and behaviours (good and bad).
- Discipline / rule-following vs breaking.
- Any strong FOMO / revenge / hesitation patterns.
- Concrete lessons for the trader.
- Concrete guidance for how Jarvis should handle him tomorrow.

Style:
- Direct, honest, supportive.
- Use short paragraphs and bullet points.
- 400–800 words max.
`;

    const userPrompt = `
Existing long-term profile summary (might be empty, use only as background):

---
${existingProfile?.summary || "(no long-term profile yet)"}
---

Here are the raw logs from the last 24h:

---
${formatted}
---

Write a single **daily journal entry** for this date: ${now
      .toISOString()
      .slice(0, 10)}.
`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 1200,
    });

    const journalText =
      completion.choices?.[0]?.message?.content?.trim();

    if (!journalText) {
      return NextResponse.json(
        {
          ok: false,
          error: "EMPTY_JOURNAL",
          message: "Model did not return a journal entry.",
        },
        { status: 500 }
      );
    }

    const entryDate = now.toISOString().slice(0, 10);

    await logJournalEntry({
      userId,
      entryDate,
      title: `Daily Journal – ${entryDate}`,
      summary: journalText,
      tags: ["auto", "daily", "jarvis"],
    });

    return NextResponse.json({
      ok: true,
      message: "Daily journal entry created.",
      date: entryDate,
      length: journalText.length,
    });
  } catch (err) {
    console.error("/api/journal/daily error:", err);
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      String(err);

    return NextResponse.json(
      { ok: false, error: "JOURNAL_ERROR", message },
      { status: 500 }
    );
  }
}
