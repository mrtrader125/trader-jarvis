"use client";

import React, { useEffect, useState } from "react";

interface AdminGuardProps {
  children: React.ReactNode;
}

/**
 * Simple client-side admin gate.
 * - Asks for a PIN.
 * - Stores success in localStorage ("jarvis-admin" = "1").
 * - PIN is taken from NEXT_PUBLIC_ADMIN_PIN or defaults to "jarvis1234".
 *
 * This is NOT meant as enterprise security, just a safe gate for a personal tool.
 */
const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState("");

  const ADMIN_PIN =
    process.env.NEXT_PUBLIC_ADMIN_PIN && process.env.NEXT_PUBLIC_ADMIN_PIN.trim()
      ? process.env.NEXT_PUBLIC_ADMIN_PIN.trim()
      : "jarvis1234";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("jarvis-admin");
    if (stored === "1") {
      setIsAuthed(true);
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (pinInput.trim() === ADMIN_PIN) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("jarvis-admin", "1");
      }
      setIsAuthed(true);
    } else {
      setError("Wrong PIN bro. Try again.");
    }
  }

  function handleLogout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("jarvis-admin");
    }
    setIsAuthed(false);
    setPinInput("");
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
        <div className="w-full max-w-sm border border-slate-800 rounded-2xl p-6 bg-slate-900/70 backdrop-blur">
          <h1 className="text-xl font-semibold mb-2 text-center">
            Jarvis Admin Access
          </h1>
          <p className="text-xs text-slate-400 mb-4 text-center">
            Enter the admin PIN to manage Jarvis&apos;s brain.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">
                Admin PIN
              </label>
              <input
                type="password"
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoComplete="off"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full mt-1 rounded-md bg-emerald-600 text-xs font-medium py-2 hover:bg-emerald-500 transition"
            >
              Unlock Admin
            </button>
          </form>

          <p className="mt-4 text-[11px] text-slate-500 text-center">
            Default PIN: <span className="font-mono">jarvis1234</span> <br />
            (You can change it via <span className="font-mono">NEXT_PUBLIC_ADMIN_PIN</span>)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex justify-end px-4 pt-3">
        <button
          onClick={handleLogout}
          className="text-[11px] text-slate-400 hover:text-slate-200"
        >
          Exit Admin
        </button>
      </div>
      {children}
    </div>
  );
};

export default AdminGuard;
