"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "jarvis-daily-checkins-v1";

const defaultForm = {
  date: "",
  sleepHours: "",
  sleepQuality: "Okay",
  mood: "Calm",
  stress: "Low",
  energy: "Normal",
  focus: "Normal",
  urgeToTrade: "Normal",
  notes: "",
  plan: "",
};

export default function CheckinPage() {
  const [checkins, setCheckins] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [analysisError, setAnalysisError] = useState("");

  // Load from localStorage
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCheckins(parsed);
      }
    } catch (e) {
      console.error("Failed to load checkins", e);
    }
  }, []);

  // Save on change
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checkins));
    } catch (e) {
      console.error("Failed to save checkins", e);
    }
  }, [checkins]);

  // Set default date = today
  useEffect(() => {
    if (!form.date) {
      const today = new Date().toISOString().slice(0, 10);
      setForm((prev) => ({ ...prev, date: today }));
    }
  }, [form.date]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const date = form.date || new Date().toISOString().slice(0, 10);

    const newCheckin = {
      id: Date.now(),
      date,
      sleepHours: form.sleepHours.trim(),
      sleepQuality: form.sleepQuality,
      mood: form.mood,
      stress: form.stress,
      energy: form.energy,
      focus: form.focus,
      urgeToTrade: form.urgeToTrade,
      notes: form.notes.trim(),
      plan: form.plan.trim(),
    };

    // Prevent duplicate for same day (replace last with same date)
    setCheckins((prev) => {
      const filtered = prev.filter((c) => c.date !== date);
      return [newCheckin, ...filtered];
    });

    setAnalysisText("");
    setAnalysisError("");
  };

  const stats = useMemo(() => {
    if (!checkins.length) {
      return {
        days: 0,
        avgSleep: null,
        highStressDays: 0,
        lowEnergyDays: 0,
      };
    }

    const last7 = checkins.slice(0, 7);
    let sleepSum = 0;
    let sleepCount = 0;
    let highStress = 0;
    let lowEnergy = 0;

    for (const c of last7) {
      const hrs = Number(c.sleepHours);
      if (!Number.isNaN(hrs) && hrs > 0 && hrs < 18) {
        sleepSum += hrs;
        sleepCount += 1;
      }
      if (c.stress === "High" || c.stress === "Very high") highStress += 1;
      if (c.energy === "Low" || c.energy === "Very low") lowEnergy += 1;
    }

    return {
      days: last7.length,
      avgSleep: sleepCount ? sleepSum / sleepCount : null,
      highStressDays: highStress,
      lowEnergyDays: lowEnergy,
    };
  }, [checkins]);

  const handleAskJarvis = async () => {
    if (!checkins.length) {
      alert("Do a check-in first, then ask Jarvis about today.");
      return;
    }

    const today = checkins[0]; // latest

    setAnalysisLoading(true);
    setAnalysisText("");
    setAnalysisError("");

    try {
      const summary = `
Here is my daily check-in as a trader:

Date: ${today.date}
Sleep hours: ${today.sleepHours || "n/a"}
Sleep quality: ${today.sleepQuality}
Mood: ${today.mood}
Stress: ${today.stress}
Energy: ${today.energy}
Focus: ${today.focus}
Urge to trade: ${today.urgeToTrade}
Notes: ${today.notes || "none"}
Planned actions: ${today.plan || "none"}

Using this, I want you to:
- Judge if I'm mentally FIT TO TRADE today, and if I should trade normal size, reduced size, or not trade.
- Point out any red flags (revenge mode, FOMO energy, burnout, tilt, overconfidence).
- Give 3–5 simple rules for how I should behave for the rest of today (risk, number of trades, when to stop, what to avoid).
- Talk to me like a honest but caring friend + performance coach. Be direct but supportive.
`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: summary }],
        }),
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);

      const data = await res.json();
      const reply =
        data.reply ||
        "I couldn't generate feedback this time. Try again in a bit or check your connection.";

      setAnalysisText(reply);
    } catch (err) {
      console.error(err);
      setAnalysisError(
        "Jarvis couldn't analyze today's state (API / internet issue). Try again later."
      );
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleDelete = (id) => {
    if (!confirm("Delete this check-in?")) return;
    setCheckins((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-2 py-4 sm:px-4">
      <div className="flex w-full max-w-5xl flex-col gap-4 sm:gap-5">
        {/* Header */}
        <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 ring-2 ring-amber-500/60">
              <span className="text-xl">🧠</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-50 sm:text-lg">
                Daily Check-In
              </h1>
              <p className="text-xs text-slate-400 sm:text-sm">
                Track sleep, mood, stress & focus so Jarvis can tell you how to handle
                trading today.
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

        <main className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Stats + Ask Jarvis */}
          <section className="w-full space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-xl shadow-black/40 backdrop-blur sm:p-5 lg:w-72">
            <h2 className="text-sm font-semibold text-slate-100">
              Mental Fitness (last 7 days)
            </h2>
            <p className="text-xs text-slate-400">
              Not about being perfect — just honest. Jarvis cares about your state more
              than your entries.
            </p>

            <div className="grid grid-cols-1 gap-3 pt-2 text-xs">
              <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
                <div className="text-[0.7rem] text-slate-400">Days logged</div>
                <div className="mt-1 text-lg font-semibold text-slate-50">
                  {stats.days}
                </div>
              </div>

              <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
                <div className="text-[0.7rem] text-slate-400">Avg sleep (hrs)</div>
                <div className="mt-1 text-lg font-semibold text-slate-50">
                  {stats.avgSleep ? stats.avgSleep.toFixed(1) : "—"}
                </div>
              </div>

              <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
                <div className="text-[0.7rem] text-slate-400">High-stress days</div>
                <div className="mt-1 text-lg font-semibold text-rose-400">
                  {stats.highStressDays}
                </div>
              </div>

              <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800">
                <div className="text-[0.7rem] text-slate-400">Low-energy days</div>
                <div className="mt-1 text-lg font-semibold text-amber-300">
                  {stats.lowEnergyDays}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAskJarvis}
              disabled={analysisLoading || !checkins.length}
              className="mt-2 w-full rounded-xl bg-amber-500 px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-950 shadow-lg shadow-amber-500/40 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400 disabled:shadow-none"
            >
              {analysisLoading
                ? "Jarvis is reading today…"
                : "Ask Jarvis about today"}
            </button>
            <p className="text-[0.65rem] text-slate-500">
              Uses your latest check-in as context.
            </p>
          </section>

          {/* Form + analysis + history */}
          <section className="flex-1 space-y-4">
            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-xl shadow-black/40 backdrop-blur sm:p-5"
            >
              <h2 className="text-sm font-semibold text-slate-100">
                Log today&apos;s state
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
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Sleep hours
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    value={form.sleepHours}
                    onChange={(e) => handleChange("sleepHours", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Sleep quality
                  </label>
                  <select
                    value={form.sleepQuality}
                    onChange={(e) => handleChange("sleepQuality", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  >
                    <option>Great</option>
                    <option>Good</option>
                    <option>Okay</option>
                    <option>Bad</option>
                    <option>Very bad</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Mood
                  </label>
                  <select
                    value={form.mood}
                    onChange={(e) => handleChange("mood", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  >
                    <option>Calm</option>
                    <option>Happy</option>
                    <option>Neutral</option>
                    <option>Anxious</option>
                    <option>Frustrated</option>
                    <option>Angry</option>
                    <option>Sad</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Stress
                  </label>
                  <select
                    value={form.stress}
                    onChange={(e) => handleChange("stress", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  >
                    <option>Low</option>
                    <option>Moderate</option>
                    <option>High</option>
                    <option>Very high</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Energy
                  </label>
                  <select
                    value={form.energy}
                    onChange={(e) => handleChange("energy", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  >
                    <option>Very low</option>
                    <option>Low</option>
                    <option>Normal</option>
                    <option>High</option>
                    <option>Very high</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Focus
                  </label>
                  <select
                    value={form.focus}
                    onChange={(e) => handleChange("focus", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  >
                    <option>Very low</option>
                    <option>Low</option>
                    <option>Normal</option>
                    <option>High</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[0.7rem] font-medium text-slate-400">
                    Urge to trade
                  </label>
                  <select
                    value={form.urgeToTrade}
                    onChange={(e) => handleChange("urgeToTrade", e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  >
                    <option>Very low</option>
                    <option>Low</option>
                    <option>Normal</option>
                    <option>High</option>
                    <option>Extreme / Revenge mode</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[0.7rem] font-medium text-slate-400">
                  Notes (how you feel, what&apos;s going on)
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  placeholder="Anything stressing you? Any anger from yesterday? Anything that might affect your trading?"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[0.7rem] font-medium text-slate-400">
                  Plan for today
                </label>
                <textarea
                  rows={2}
                  value={form.plan}
                  onChange={(e) => handleChange("plan", e.target.value)}
                  className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  placeholder="Example: Max 2 trades · 0.5R size · stop trading after -1.5R · no trading if emotional."
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-950 shadow-lg shadow-amber-500/40 transition hover:bg-amber-400"
                >
                  Save today
                  <span>✓</span>
                </button>
              </div>
            </form>

            {/* Jarvis analysis */}
            {(analysisLoading || analysisText || analysisError) && (
              <section className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-xl shadow-black/40 backdrop-blur sm:p-5">
                <h2 className="mb-1 text-sm font-semibold text-slate-100">
                  Jarvis guidance for today
                </h2>
                <p className="mb-3 text-[0.7rem] text-slate-500">
                  Based on your latest check-in. Use this to decide risk, number of trades
                  and whether to trade at all.
                </p>

                {analysisLoading && (
                  <p className="text-xs text-slate-400">Analyzing… hold on bro.</p>
                )}
                {analysisError && (
                  <p className="text-xs text-rose-400">{analysisError}</p>
                )}
                {analysisText && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
                    {analysisText}
                  </div>
                )}
              </section>
            )}

            {/* History */}
            <section className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-3 shadow-xl shadow-black/40 backdrop-blur sm:p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">
                  Recent check-ins
                </h2>
                <span className="text-[0.7rem] text-slate-500">
                  {checkins.length ? `${checkins.length} day(s)` : "No logs yet"}
                </span>
              </div>

              {checkins.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Start by logging today. This history is for you and Jarvis to see your
                  patterns.
                </p>
              ) : (
                <div className="space-y-2 text-xs">
                  {checkins.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div>
                        <div className="text-[0.7rem] font-semibold text-slate-100">
                          {c.date}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[0.68rem] text-slate-300">
                          <span>Sleep: {c.sleepHours || "?"}h ({c.sleepQuality})</span>
                          <span>· Mood: {c.mood}</span>
                          <span>· Stress: {c.stress}</span>
                          <span>· Energy: {c.energy}</span>
                          <span>· Focus: {c.focus}</span>
                          <span>· Urge: {c.urgeToTrade}</span>
                        </div>
                        {c.notes && (
                          <div className="mt-1 text-[0.68rem] text-slate-400">
                            Notes: {c.notes}
                          </div>
                        )}
                      </div>
                      <div className="flex items-start justify-end">
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="mt-1 rounded-lg border border-rose-500/70 bg-rose-500/10 px-2 py-1 text-[0.65rem] font-semibold text-rose-300 hover:bg-rose-500/25 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>
        </main>
      </div>
    </div>
  );
}
