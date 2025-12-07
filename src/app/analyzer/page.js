// src/app/analyzer/page.js
"use client";

import { useState } from "react";

export default function AnalyzerPage() {
  const [description, setDescription] = useState("");
  const [context, setContext] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAnalyze(e) {
    e.preventDefault();
    setError("");
    setAnalysis("");

    if (!description.trim()) {
      setError("Bro, paste at least one trade / setup description.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/trade/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          context,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(
          data?.message ||
            "Something broke while analyzing this trade."
        );
        return;
      }

      setAnalysis(data.analysis || "");
    } catch (err) {
      console.error(err);
      setError(
        "Bro, I couldn't reach the analyzer right now. Try again in a bit."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Trade / Setup Analyzer
        </h1>
        <p className="text-slate-400 text-sm">
          Paste any trade or setup you took (or plan to take). Jarvis will
          break it down: quality, risk, psychology, and lessons.
        </p>
      </section>

      <form
        onSubmit={handleAnalyze}
        className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-200">
            Trade / setup description
          </label>
          <textarea
            className="w-full min-h-[140px] rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
            placeholder={`Example:\nLong NIFTY 5m at 23350 after HTF demand + 5m breakout.\nStop 23300, target 23450 (RR 1:2). Entered late after missing first move, pushed size a bit.\nWhat do you think of this trade?`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-200">
            Extra context (optional)
          </label>
          <textarea
            className="w-full min-h-[80px] rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
            placeholder="How were you feeling? Was this part of your plan or impulsive? Any rules broken?"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Analyzing..." : "Analyze trade"}
        </button>
      </form>

      {analysis && (
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-medium">Jarvis Analysis</h2>
          <div className="text-sm whitespace-pre-wrap text-slate-100">
            {analysis}
          </div>
        </section>
      )}
    </div>
  );
}
