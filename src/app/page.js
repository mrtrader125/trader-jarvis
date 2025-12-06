"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

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

  return (
    <div className="flex min-h-screen items-center justify-center px-2 py-4 sm:px-4">
      <div className="flex w-full max-w-5xl flex-col gap-3 sm:gap-4">
        {/* Top bar / title */}
        <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur sm:flex-row sm:items-center sm:px-6">
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

          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-[0.7rem]">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-300 ring-1 ring-emerald-500/50">
              Live · Connected
            </span>
            <span className="rounded-full bg-slate-900/80 px-3 py-1 text-slate-400 ring-1 ring-slate-700">
              V1 · Chat only · More coming soon
            </span>

            {/* New: Daily check-in link */}
            <Link
              href="/checkin"
              className="rounded-full bg-amber-500/15 px-3 py-1 font-medium text-amber-200 ring-1 ring-amber-500/60 hover:bg-amber-500/25 transition"
            >
              Daily Check-in
            </Link>

            {/* Journal link */}
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
