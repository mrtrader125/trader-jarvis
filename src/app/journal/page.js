"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "jarvis-trade-journal-v1";

const defaultForm = {
  date: "",
  symbol: "",
  direction: "Long",
  entry: "",
  stop: "",
  target: "",
  rrPlanned: "",
  rrResult: "",
  outcome: "Win",
  emotionBefore: "Calm",
  emotionAfter: "Neutral",
  notes: "",
};

export default function JournalPage() {
  const [trades, setTrades] = useState([]);
  const [form, setForm] = useState(defaultForm);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTrades(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to load trades from storage", e);
    }
  }, []);

  // Save to localStorage whenever trades change
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    } catch (e) {
      console.error("Failed to save trades to storage", e);
    }
  }, [trades]);

  // Basic stats
  const stats = useMemo(() => {
    if (!trades.length) {
      return {
        total: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalR: 0,
        avgR: 0,
      };
    }

    let wins = 0;
    let losses = 0;
    let totalR = 0;

    for (const t of trades) {
      const r = Number(t.rrResult) || 0;
      totalR += r;
      if (t.outcome === "Win") wins += 1;
      if (t.outcome === "Loss") losses += 1;
    }

    const total = trades.length;
    const winRate = total ? (wins / total) * 100 : 0;
    const avgR = total ? totalR / total : 0;

    return {
      total,
      wins,
      losses,
      winRate,
      totalR,
      avgR,
    };
  }, [trades]);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const symbol = form.symbol.trim().toUpperCase();
    if (!symbol) {
      alert("Symbol/pair is required.");
      return;
    }

    const date = form.date || new Date().toISOString().slice(0, 10);

    const newTrade = {
      id: Date.now(),
      date,
      symbol,
      direction: form.direction,
      entry: form.entry.trim(),
      stop: form.stop.trim(),
      target: form.target.trim(),
      rrPlanned: form.rrPlanned.trim(),
      rrResult: form.rrResult.trim(),
      outcome: form.outcome,
      emotionBefore: form.emotionBefore,
      emotionAfter: form.emotionAfter,
      notes: form.notes.trim(),
    };

    setTrades((prev) => [newTrade, ...prev]);
    setForm((prev) => ({
      ...defaultForm,
      // keep date defaulting to last used
      date,
    }));
  };

  const handleDelete = (id) => {
    if (!confirm("Delete this trade?")) return;
    setTrades((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-2 py-4 sm:px-4">
      <div className="flex w-full max-w-6xl flex-col gap-4 sm:gap-5">
        {/* Header */}
        <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/15 ring-2 ring-indigo-500/60">
              <span className="text-xl">📒</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-50 sm:text-lg">
                Trading Journal
              </h1>
              <p className="text-xs text-slate-400 sm:text-sm">
                Log each trade with R, emotions, and outcomes. Jarvis will use this later
                to understand your patterns.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-[0.7rem]">
            <span className="rounded-full bg-slate-900/80 px-3 py-1 text-slate-400 ring-1 ring-slate-700">
              Stored locally in your browser
            </span>
            <Link
              href="/"
              className="rounded-full bg-emerald-500/15 px-3 py-1 font-medium text-emerald-200 ring-1 ring-emerald-500/60 hover:bg-emerald-500/25 transition"
            >
              ← Back to Jarvis
            </Link>
          </div>
        </header>

        {/* Stats + Form */}
        <main className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Stats card */}
          <section className="w-full space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-xl shadow-black/40 backdrop-blur sm:p-5 lg:w-72">
            <h2 className="text-sm font-semibold text-slate-100">
              Session Stats
            </h2>
            <p className="text-xs text-slate-400">
              Quick overview of your journal performance. Focus on consistency, not just R.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
                <div className="text-[0.7rem] text-slate-400">Total Trades</div>
                <div className="mt-1 text-lg font-semibold text-slate-50">
                  {stats.total}
                </div>
              </div>
              <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
                <div className="text-[0.7rem] text-slate-400">Win Rate</div>
                <div className="mt-1 text-lg font-semibold text-emerald-400">
                  {stats.total ? `${stats.winRate.toFixed(1)}%` : "—"}
                </div>
              </div>
              <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
                <div className="text-[0.7rem] text-slate-400">Total R</div>
                <div className="mt-1 text-lg font-semibold text-slate-50">
                  {stats.total ? stats.totalR.toFixed(2) : "—"}
                </div>
              </div>
              <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
                <div className="text-[0.7rem] text-slate-400">Avg R / Trade</div>
                <div className="mt-1 text-lg font-semibold text-slate-50">
                  {stats.total ? stats.avgR.toFixed(2) : "—"}
                </div>
              </div>
            </div>
          </section>

          {/* Form + table */}
          <section className="flex-1 space-y-4">
            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-xl shadow-black/40 backdrop-blur sm:p-5"
            >
              <h2 className="text-sm font-semibold text-slate-100">
                Log a New Trade
              </h2>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Date
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => handleChange("date", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Symbol / Pair *
                  </label>
                  <input
                    type="text"
                    placeholder="XAUUSD, NAS100…"
                    value={form.symbol}
                    onChange={(e) => handleChange("symbol", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs uppercase text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Direction
                  </label>
                  <select
                    value={form.direction}
                    onChange={(e) => handleChange("direction", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option>Long</option>
                    <option>Short</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Entry
                  </label>
                  <input
                    type="text"
                    value={form.entry}
                    onChange={(e) => handleChange("entry", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Stop
                  </label>
                  <input
                    type="text"
                    value={form.stop}
                    onChange={(e) => handleChange("stop", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Target
                  </label>
                  <input
                    type="text"
                    value={form.target}
                    onChange={(e) => handleChange("target", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Planned R:R
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.rrPlanned}
                    onChange={(e) => handleChange("rrPlanned", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Result R
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.rrResult}
                    onChange={(e) => handleChange("rrResult", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Outcome
                  </label>
                  <select
                    value={form.outcome}
                    onChange={(e) => handleChange("outcome", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option>Win</option>
                    <option>Loss</option>
                    <option>Break-even</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Emotion Before
                  </label>
                  <select
                    value={form.emotionBefore}
                    onChange={(e) => handleChange("emotionBefore", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option>Calm</option>
                    <option>Confident</option>
                    <option>Anxious</option>
                    <option>Fearful</option>
                    <option>Revenge mode</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Emotion After
                  </label>
                  <select
                    value={form.emotionAfter}
                    onChange={(e) => handleChange("emotionAfter", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option>Neutral</option>
                    <option>Happy</option>
                    <option>Frustrated</option>
                    <option>Angry</option>
                    <option>Drained</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[0.7rem] font-medium text-slate-400">
                  Notes (setup quality, mistakes, context)
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Why did you take this trade? Did you follow your plan? Anything you would change?"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-950 shadow-lg shadow-indigo-500/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-800/60 disabled:text-slate-300 disabled:shadow-none"
                >
                  Save Trade
                  <span>✓</span>
                </button>
              </div>
            </form>

            {/* Trades table */}
            <section className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-3 shadow-xl shadow-black/40 backdrop-blur sm:p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">
                  Logged Trades
                </h2>
                <span className="text-[0.7rem] text-slate-500">
                  {trades.length ? `${trades.length} trade(s)` : "No trades logged yet"}
                </span>
              </div>

              {trades.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Nothing here yet. After you log trades, they will show up in this list.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs text-slate-200">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-left font-medium">Symbol</th>
                        <th className="px-3 py-2 text-left font-medium">Dir</th>
                        <th className="px-3 py-2 text-left font-medium">Planned R</th>
                        <th className="px-3 py-2 text-left font-medium">Result R</th>
                        <th className="px-3 py-2 text-left font-medium">Outcome</th>
                        <th className="px-3 py-2 text-left font-medium">
                          Emotion Before
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Emotion After
                        </th>
                        <th className="px-3 py-2 text-left font-medium">Notes</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t) => (
                        <tr
                          key={t.id}
                          className="border-b border-slate-900/60 hover:bg-slate-900/60"
                        >
                          <td className="px-3 py-2 align-top text-slate-300">
                            {t.date}
                          </td>
                          <td className="px-3 py-2 align-top font-semibold text-slate-50">
                            {t.symbol}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-300">
                            {t.direction}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-300">
                            {t.rrPlanned || "—"}
                          </td>
                          <td
                            className={`px-3 py-2 align-top font-semibold ${
                              Number(t.rrResult) > 0
                                ? "text-emerald-400"
                                : Number(t.rrResult) < 0
                                ? "text-rose-400"
                                : "text-slate-300"
                            }`}
                          >
                            {t.rrResult || "—"}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-300">
                            {t.outcome}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-400">
                            {t.emotionBefore}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-400">
                            {t.emotionAfter}
                          </td>
                          <td className="px-3 py-2 align-top max-w-xs text-slate-400">
                            {t.notes || "—"}
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="rounded-lg border border-rose-500/70 bg-rose-500/10 px-2 py-1 text-[0.65rem] font-semibold text-rose-300 hover:bg-rose-500/25 transition"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
        </main>
      </div>
    </div>
  );
}
