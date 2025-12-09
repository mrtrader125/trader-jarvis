"use client";

import { useEffect, useState } from "react";
import { computeReadinessScore } from "@/lib/readinessScore";

export default function ReadinessPage() {
  const [latestCheckIn, setLatestCheckIn] = useState(null);
  const [recentTrades, setRecentTrades] = useState([]);
  const [result, setResult] = useState(null);
  const [storageDebug, setStorageDebug] = useState({
    keys: [],
    checkinKey: null,
    tradesKey: null,
  });

  useEffect(() => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        keys.push(key);
      }

      let foundCheckins = null;
      let foundCheckinKey = null;
      let foundTrades = null;
      let foundTradesKey = null;

      // 1) Prefer specific known keys if they exist
      const knownCheckinKeys = [
        "jarvis_checkins",
        "jarvis_daily_checkins",
        "trader_jarvis_checkins",
      ];
      const knownTradeKeys = [
        "jarvis_trades",
        "jarvis_trading_journal",
        "trader_jarvis_trades",
      ];

      for (const k of knownCheckinKeys) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length > 0) {
              foundCheckins = arr;
              foundCheckinKey = k;
              break;
            }
          } catch (e) {
            // ignore
          }
        }
      }

      for (const k of knownTradeKeys) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length > 0) {
              foundTrades = arr;
              foundTradesKey = k;
              break;
            }
          } catch (e) {
            // ignore
          }
        }
      }

      // 2) If still not found, auto-detect by shape
      if (!foundCheckins) {
        for (const key of keys) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          try {
            const value = JSON.parse(raw);
            if (Array.isArray(value) && value.length > 0) {
              // looks like checkins?
              const looksLikeCheckin = value.some((item) => {
                if (!item || typeof item !== "object") return false;
                return (
                  "sleep" in item ||
                  "sleepHours" in item ||
                  "sleepQuality" in item ||
                  "mood" in item ||
                  "stress" in item
                );
              });
              if (looksLikeCheckin) {
                foundCheckins = value;
                foundCheckinKey = key;
                break;
              }
            }
          } catch (_) {
            // ignore parse errors
          }
        }
      }

      if (!foundTrades) {
        for (const key of keys) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          try {
            const value = JSON.parse(raw);
            if (Array.isArray(value) && value.length > 0) {
              // looks like trades?
              const looksLikeTrades = value.some((item) => {
                if (!item || typeof item !== "object") return false;
                return (
                  "symbol" in item ||
                  "pair" in item ||
                  "resultR" in item ||
                  "plannedRR" in item ||
                  "outcome" in item
                );
              });
              if (looksLikeTrades) {
                foundTrades = value;
                foundTradesKey = key;
                break;
              }
            }
          } catch (_) {
            // ignore
          }
        }
      }

      // 3) Update state
      if (foundCheckins && foundCheckins.length > 0) {
        setLatestCheckIn(foundCheckins[foundCheckins.length - 1]);
      }
      if (foundTrades && foundTrades.length > 0) {
        setRecentTrades(foundTrades);
      }

      setStorageDebug({
        keys,
        checkinKey: foundCheckinKey,
        tradesKey: foundTradesKey,
      });
    } catch (e) {
      console.error("Error scanning localStorage:", e);
    }
  }, []);

  useEffect(() => {
    if (latestCheckIn) {
      setResult(computeReadinessScore(latestCheckIn, recentTrades));
    } else {
      setResult(computeReadinessScore(null, recentTrades));
    }
  }, [latestCheckIn, recentTrades]);

  const dateLabel = latestCheckIn?.date || "No check-in";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-6">
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

        <main className="grid gap-6 md:grid-cols-[2fr,1.4fr]">
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
                No data yet. Log a daily check-in and some journal trades first.
              </p>
            )}
          </section>

          {/* Data + debug */}
          <section className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <h2 className="text-sm font-semibold mb-2">Latest Check-In</h2>
              {latestCheckIn ? (
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-950/60 rounded-xl p-3 max-h-64 overflow-y-auto">
{JSON.stringify(latestCheckIn, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-slate-500">
                  No check-ins found yet in localStorage.
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
                  No trades found yet in localStorage.
                </p>
              )}
            </div>

            {/* Debug panel so we can see what's going on */}
            <div className="bg-slate-900/40 border border-dashed border-slate-700 rounded-2xl p-4">
              <h2 className="text-xs font-semibold mb-2 text-slate-400">
                Storage Debug (for you & Jarvis dev)
              </h2>
              <p className="text-[11px] text-slate-500 mb-1">
                LocalStorage keys on this browser:
              </p>
              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap break-words bg-slate-950/60 rounded-xl p-3 max-h-40 overflow-y-auto mb-2">
{JSON.stringify(storageDebug.keys, null, 2)}
              </pre>
              <p className="text-[11px] text-slate-500">
                Detected check-in key:{" "}
                <span className="text-slate-200">
                  {storageDebug.checkinKey || "none"}
                </span>
              </p>
              <p className="text-[11px] text-slate-500">
                Detected trades key:{" "}
                <span className="text-slate-200">
                  {storageDebug.tradesKey || "none"}
                </span>
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
