"use client";

import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";

export default function AdminPage() {
  return (
    <AdminGuard>
      <main className="max-w-5xl mx-auto px-4 pb-10 pt-4 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Jarvis Admin Console</h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Private control panel for managing Jarvis&apos;s brain, training
              data, and system settings. Only for you.
            </p>
          </div>
          <Link
            href="/"
            className="text-xs text-emerald-400 hover:text-emerald-200"
          >
            ← Back to Jarvis
          </Link>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Knowledge Data Center */}
          <Link
            href="/jarvis/data-center"
            className="border border-slate-800 rounded-2xl p-4 bg-slate-900/60 hover:bg-slate-900 transition group"
          >
            <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
              Knowledge Data Center
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300 border border-emerald-700/60">
                LIVE
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mb-2">
              Manually teach Jarvis trading psychology, math rules, money
              doctrine, and life principles. This becomes his core brain.
            </p>
            <p className="text-[11px] text-emerald-300 group-hover:text-emerald-200">
              Open data center →
            </p>
          </Link>

          {/* Training Data placeholder */}
          <div className="border border-slate-800 rounded-2xl p-4 bg-slate-900/40 opacity-80">
            <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
              Training Data (Coming Soon)
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-200 border border-slate-600/60">
                PLANNED
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mb-2">
              This will be the place to upload structured training examples:
              transcripts, journaling samples, &quot;good vs bad&quot; trades,
              and conversation patterns Jarvis should learn from.
            </p>
            <p className="text-[11px] text-slate-500">
              We&apos;ll wire this later into a custom training loop.
            </p>
          </div>

          {/* System / profile */}
          <Link
            href="/profile"
            className="border border-slate-800 rounded-2xl p-4 bg-slate-900/60 hover:bg-slate-900 transition group"
          >
            <h2 className="text-sm font-semibold mb-1">Profile & Settings</h2>
            <p className="text-[11px] text-slate-400 mb-2">
              Edit your timezone, routine, personality sliders, and financial
              targets so Jarvis always reasons from your real situation.
            </p>
            <p className="text-[11px] text-emerald-300 group-hover:text-emerald-200">
              Open profile →
            </p>
          </Link>

          {/* Diagnostics placeholder */}
          <div className="border border-slate-800 rounded-2xl p-4 bg-slate-900/40 opacity-80">
            <h2 className="text-sm font-semibold mb-1">
              Diagnostics & Logs (Future)
            </h2>
            <p className="text-[11px] text-slate-400 mb-2">
              A future panel to inspect Jarvis&apos;s decisions: which rules he
              used, what math he ran, and why he gave a certain answer.
            </p>
            <p className="text-[11px] text-slate-500">
              Useful for debugging misunderstandings and improving your rules.
            </p>
          </div>
        </section>
      </main>
    </AdminGuard>
  );
}
