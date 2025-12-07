// src/app/profile/page.js
import { PRIMARY_USER_ID } from "@/lib/constants";
import {
  getUserProfileSummary,
  getRecentMemories,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const userId = PRIMARY_USER_ID;

  const [profileRow, recentMemories] = await Promise.all([
    getUserProfileSummary(userId),
    getRecentMemories({ userId, limit: 5 }),
  ]);

  const summary = profileRow?.summary || null;
  const updatedAt = profileRow?.updated_at
    ? new Date(profileRow.updated_at)
    : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Jarvis Profile Summary
          </h1>
          <p className="text-slate-400 text-sm">
            How Jarvis currently understands you as a trader and
            person — based on long-term memories from both Web and
            Telegram.
          </p>
        </header>

        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">
                Long-term Profile
              </h2>
              <p className="text-xs text-slate-400">
                Updated automatically from your recent conversations.
              </p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <div>User ID: {userId}</div>
              <div>
                Last updated:{" "}
                {updatedAt
                  ? updatedAt.toLocaleString()
                  : "Not generated yet"}
              </div>
            </div>
          </div>

          {summary ? (
            <article className="prose prose-invert prose-sm max-w-none">
              {summary.split("\n\n").map((block, idx) => (
                <p key={idx}>{block}</p>
              ))}
            </article>
          ) : (
            <div className="text-sm text-slate-400">
              No profile summary yet. Jarvis will build this once
              you’ve had a few conversations and the daily summary
              job runs, or when you manually hit{" "}
              <code>/api/memory/summary</code>.
            </div>
          )}
        </section>

        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium">
              Latest raw memories (last {recentMemories.length} )
            </h2>
            <span className="text-xs text-slate-400">
              Source: jarvis_memory
            </span>
          </div>

          {recentMemories.length === 0 ? (
            <p className="text-sm text-slate-400">
              No memories stored yet. Chat with Jarvis on the web
              or Telegram and they’ll start appearing here.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {recentMemories.map((m) => (
                <li
                  key={m.id}
                  className="border border-slate-800 rounded-xl p-3 bg-slate-950/60"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>
                      {m.channel} •{" "}
                      {new Date(m.created_at).toLocaleString()}
                    </span>
                    <span>importance: {m.importance ?? 1}</span>
                  </div>
                  <pre className="whitespace-pre-wrap text-slate-100 text-xs">
                    {m.content}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
