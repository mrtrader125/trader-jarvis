// src/app/api/jobs/summarize/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRelevantMemories } from "@/lib/jarvis-memory";
import summarizeItemsWithLLM from "@/lib/memory-summarizer";

const supabase = createClient();

// Config (tune these via env)
const MEMORY_COUNT_THRESHOLD = Number(process.env.MEMORY_SUMMARY_THRESHOLD || 120);
const BATCH_LIMIT = Number(process.env.MEMORY_SUMMARY_BATCH_LIMIT || 50); // Users processed per run
const ROW_FETCH_LIMIT = Number(process.env.MEMORY_SUMMARY_ROW_FETCH_LIMIT || 10000); // rows to fetch for aggregation

/**
 * findUsersNeedingSummary(threshold, limit)
 * - Safe typed implementation that fetches up to ROW_FETCH_LIMIT rows from jarvis_memory
 *   and aggregates counts client-side to find users with counts > threshold.
 *
 * Note: This is simpler and typesafe for serverless builds. If your table grows very large,
 * consider replacing with an optimized SQL aggregate run inside Supabase (SQL function).
 */
async function findUsersNeedingSummary(threshold: number, limit = 50) {
  // Fetch user_id for recent rows (up to ROW_FETCH_LIMIT)
  const { data: rows, error } = await supabase
    .from("jarvis_memory")
    .select("user_id")
    .limit(ROW_FETCH_LIMIT);

  if (error) {
    console.error("findUsersNeedingSummary fetch error", error);
    return [];
  }
  if (!rows || rows.length === 0) return [];

  // Aggregate counts client-side
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const uid = (r as any).user_id ? String((r as any).user_id) : "unknown";
    counts[uid] = (counts[uid] || 0) + 1;
  }

  // Filter users above threshold, sort by count desc and return up to `limit`
  const users = Object.entries(counts)
    .filter(([_, cnt]) => cnt > threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([uid]) => uid);

  return users;
}

/**
 * Handler
 * - This endpoint should be called by a scheduler (Vercel Cron) or by your chat route (fire-and-forget).
 * - It will iterate over users with many memory items, fetch recent items, call LLM summarizer,
 *   and persist the summary via summarizeItemsWithLLM's persist option.
 */
export async function POST(req: NextRequest) {
  try {
    // Optionally accept a JSON body with users: [userId,...] to run ad-hoc
    const body = await req.json().catch(() => ({}));
    const runUsers: string[] | undefined = Array.isArray(body?.users) ? body.users.map(String) : undefined;

    const usersToProcess = runUsers && runUsers.length > 0
      ? runUsers
      : await findUsersNeedingSummary(MEMORY_COUNT_THRESHOLD, BATCH_LIMIT);

    if (!usersToProcess || usersToProcess.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, note: "No users need summarization" });
    }

    let processed = 0;
    for (const userId of usersToProcess) {
      try {
        // Fetch raw recent items for summarization (last 365 days or adjust)
        const recent = await fetchRelevantMemories(userId, null, 24 * 365, 500);
        if (!recent || recent.length === 0) continue;

        // Call LLM summarizer and persist summary
        await summarizeItemsWithLLM({ userId, items: recent, persist: true });
        processed++;
      } catch (userErr) {
        console.error(`Error summarizing for user ${userId}`, userErr);
        // continue to next user
      }
    }

    return NextResponse.json({ ok: true, processed, users: usersToProcess.length });
  } catch (err: any) {
    console.error("jobs/summarize error", err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
