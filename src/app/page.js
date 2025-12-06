"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const CHECKIN_STORAGE_KEY = "jarvis-daily-checkins-v1";

function computeStatusFromCheckin(checkin) {
  if (!checkin) return null;

  const sleepHours = Number(checkin.sleepHours || 0);
  const { sleepQuality, mood, stress, energy, focus, urgeToTrade } = checkin;

  // --- Hard "no trade" signals ---
  const veryTired = sleepHours > 0 && sleepHours < 4;
  const awfulSleep = sleepQuality === "Very bad";
  const extremeUrge = urgeToTrade === "Extreme / Revenge mode";
  const veryHighStress = stress === "Very high";
  const veryLowEnergy = energy === "Very low";
  const veryLowFocus = focus === "Very low";

  if (
    veryTired ||
    awfulSleep ||
    extremeUrge ||
    veryHighStress ||
    veryLowEnergy ||
    veryLowFocus
  ) {
    return {
      level: "block", // red
      label: "Today: NO TRADING",
      detail:
        "Your state is risky for trading (fatigue, stress or revenge energy). Focus on recovery, journaling and routine instead of taking risk.",
    };
  }

  // --- Caution / reduced risk ---
  const lowSleep = sleepHours > 0 && sleepHours < 6;
  const badSleep = sleepQuality === "Bad";
  const highStress = stress === "High";
  const lowEnergy = energy === "Low";
  const lowFocus = focus === "Low";
  const weirdMood = ["Anxious", "Frustrated", "Angry", "Sad"].includes(mood);
  const highUrge = urgeToTrade === "High" || urgeToTrade === "Very low";

  if (
    lowSleep ||
    badSleep ||
    highStress ||
    lowEnergy ||
    lowFocus ||
    weirdMood ||
    highUrge
  ) {
    return {
      level: "caution", // amber
      label: "Today: CAREFUL · Reduce risk",
      detail:
        "Trade smaller and less. Focus on A+ setups only, limit number of trades, and stop early if you feel emotions spiking.",
    };
  }

  // --- Good to go ---
  return {
    level: "good", // green
    label: "Today: FIT TO TRADE",
    detail:
      "Your state looks solid — calm, rested and focused enough. Still follow your rules: A+ setups only, no forcing trades.",
  };
}

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hey bro, I'm your trading & life companion. Tell me what's on your mind right now.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  // New: today's mental status from /checkin
  const [todayStatus, setTodayStatus] = useState(null);

  // Scroll chat to bottom on new messages/loading
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  // Load latest check-in from localStorage and compute status
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(CHECKIN_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      // stored newest first in /checkin
      const latest = parsed[0];
      const status = computeStatusFromCheckin(latest);
      setTodayStatus(status);
    } catch (e) {
      console.error("Failed to read daily check-in", e);
    }
  }, []);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const newMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = await res.json();
      const reply =
        data.reply ?? "Something went wrong, but I'm still here. Try again in a bit.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I hit an error talking to my brain (API). Check your config or internet and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Colors for status pill
  const statusStyles =
    todayStatus?.level === "good"
      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/60"
      : todayStatus?.level === "caution"
      ? "bg-amber-500/15 text-amber-200 ring-amber-500/60"
      : todayStatus?.level === "block"
      ? "bg-rose-500/15 text-rose-200 ring-rose-500/60"
      : "bg-slate-900/80 text-slate-400 ring-slate-700";

  return (
    <div className="flex min-h-screen items-center justify-center px-2 py-4 sm:px-4">
      <div className="flex w-full max-w-5xl flex-col gap-3 sm:gap-4">
        {/* Top bar / title */}
        <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur sm:flex-row sm:items-center sm:px-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-500/60">
                <span className="text-xl">⚡</span>
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-50 sm:text-lg">
                  JARVIS V1 · Trader Companion
                </h1>
                <p className="text-xs text-slate-400 sm:text-sm">
                  Your friendly co-pilot for trading, emotions & routine.
                </p>
              </div>
            </div>

            {/* New: today status detail below title */}
            {todayStatus && (
              <p className="text-[0.7rem] text-slate-400 sm:text-xs pl-12 sm:pl-13">
                {todayStatus.detail}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-[0.7rem]">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-300 ring-1 ring-emerald-500/50">
              Live · Connected
            </span>

            {/* Today status pill */}
            <span className={`rounded-full px-3 py-1 font-medium ring-1 ${statusStyles}`}>
              {todayStatus ? todayStatus.label : "No check-in for today yet"}
            </span>

            <Link
              href="/checkin"
              className="rounded-full bg-amber-500/15 px-3 py-1 font-medium text-amber-200 ring-1 ring-amber-500/60 hover:bg-amber-500/25 transition"
            >
              Daily Check-in
            </Link>

            <Link
              href="/journal"
              className="rounded-full bg-indigo-500/15 px-3 py-1 font-medium text-indigo-200 ring-1 ring-indigo-500/60 hover:bg-indigo-500/25 transition"
            >
              Trading Journal →
            </Link>
          </div>
        </header>

        {/* Chat card */}
        <main className="flex-1">
          <div className="flex h-[70vh] flex-col rounded-2xl border border-slate-800/80 bg-slate-950/80 shadow-2xl shadow-black/50 backdrop-blur">
            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:px-6 sm:py-5">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed sm:max-w-[70%] sm:px-4 sm:py-3 ${
                      m.role === "user"
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                        : "bg-slate-900/90 text-slate-100 border border-slate-800/80 shadow-md shadow-black/40"
                    }`}
                  >
                    <div className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide">
                      {m.role === "user" ? (
                        <span className="text-emerald-100/90">You</span>
                      ) : (
                        <span className="text-emerald-400/90">Jarvis</span>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-400 sm:px-4 sm:py-3">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    Thinking with you…
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-slate-800/80 bg-slate-950/95 px-3 py-3 sm:px-6 sm:py-4">
              <div className="flex flex-col gap-2">
                <textarea
                  rows={2}
                  className="w-full resize-none rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 sm:px-4 sm:py-3"
                  placeholder="Tell me what's going on… trading, life, emotions — I'm here."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[0.7rem] text-slate-500">
                    Press{" "}
                    <span className="rounded bg-slate-800 px-1">Enter</span> to send ·{" "}
                    <span className="rounded bg-slate-800 px-1">Shift + Enter</span> for
                    new line
                  </div>
                  <button
                    onClick={sendMessage}
                    disabled={loading || !input.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800/60 disabled:text-slate-300 disabled:shadow-none"
                  >
                    {loading ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border border-emerald-800 border-t-transparent" />
                        Thinking…
                      </>
                    ) : (
                      <>
                        <span>Send</span>
                        <span>➤</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Tiny footer */}
        <footer className="flex justify-end text-[0.7rem] text-slate-500 px-1">
          Built for you · More features (journal, routine, stats) coming next 🚀
        </footer>
      </div>
    </div>
  );
}
