"use client";

import { useEffect, useState } from "react";
import { computeReadinessScore } from "@/lib/readinessScore";

export default function ReadinessPage() {
  const [latestCheckIn, setLatestCheckIn] = useState(null);
  const [recentTrades, setRecentTrades] = useState([]);
  const [result, setResult] = useState(null);

  useEffect(() => {
    try {
      const checkinsRaw = localStorage.getItem("jarvis_checkins");
      if (checkinsRaw) {
        const arr = JSON.parse(checkinsRaw);
        if (Array.isArray(arr) && arr.length > 0) {
          setLatestCheckIn(arr[arr.length - 1]); // last one
        }
      }

      const tradesRaw = localStorage.getItem("jarvis_trades");
      if (tradesRaw) {
        const arr = JSON.parse(tradesRaw);
        if (Array.isArray(arr)) {
          setRecentTrades(arr);
        }
      }
    } catch (e) {
      console.error("Error reading readiness data from localStorage:", e);
    }
  }, []);

  useEffect(() => {
    if (latestCheckIn) {
      setResult(computeReadinessScore(latestCheckIn, recentTrades));
    } else {
      setResult(
        computeReadinessScore(null, recentTrades) // will return "No data"
      );
    }
  }, [latestCheckIn, recentTrades]);

  const dateLabel = latestCheckIn?.date || "No check-in";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-4xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Readiness & Risk Mode
            </h1>
            <p className="text-sm text-slate-400">
              Combined view of your mental state and recent trading behaviour.
            </p>
          </div>
          <a
            href="/"
            className="text-xs px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
          >
            ← Back to Jarvis
          </a>
        </header>

        <main className="grid gap-6 md:grid-cols-[2fr,1.5fr]">
          {/* Score card */}
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/40">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Today&apos;s Readiness
                </p>
                <p className="text-xs text-slate-500">
                  Based on latest check-in · {dateLabel}
                </p>
              </div>
              {result && (
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    result.level === "GREEN"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                      : result.level === "YELLOW"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/40"
                      : result.level === "RED"
                      ? "bg-rose-500/15 text-rose-300 border border-rose-500/40"
                      : "bg-slate-700/60 text-slate-200 border border-slate-600"
                  }`}
                >
                  {result.level}
                </span>
              )}
            </div>

            {result ? (
              <>
                <div className="flex items-end gap-4 mb-4">
                  <p className="text-5xl font-semibold leading-none">
                    {result.score}
                  </p>
                  <p className="text-sm text-slate-400 mb-2">/ 100</p>
                </div>

                <p className="text-sm text-slate-200 leading-relaxed">
                  {result.message}
                </p>

                <div className="mt-6 text-xs text-slate-500 space-y-1">
                  <p>
                    • 0–49: 🔴 Don&apos;t trade or go micro size. Focus on
                    mental reset.
                  </p>
                  <p>
                    • 50–74: 🟡 Trade less, focus on A+ setups only, reduce
                    risk.
                  </p>
                  <p>
                    • 75–100: 🟢 Normal risk allowed, but still follow your
                    rules.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                No data yet. Log a daily check-in and a few journal trades first.
              </p>
            )}
          </section>

          {/* Raw data preview */}
          <section className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <h2 className="text-sm font-semibold mb-2">Latest Check-In</h2>
              {latestCheckIn ? (
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-950/60 rounded-xl p-3 max-h-64 overflow-y-auto">
{JSON.stringify(latestCheckIn, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-slate-500">
                  No check-ins found yet. Use the Daily Check-In page first.
                </p>
              )}
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <h2 className="text-sm font-semibold mb-2">
                Recent Trades (last 5)
              </h2>
              {recentTrades && recentTrades.length > 0 ? (
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-950/60 rounded-xl p-3 max-h-64 overflow-y-auto">
{JSON.stringify(recentTrades.slice(-5), null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-slate-500">
                  No trades found yet. Log some trades in your Trading Journal.
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
