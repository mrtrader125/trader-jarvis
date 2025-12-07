// src/app/layout.js
import "./globals.css";

export const metadata = {
  title: "Trader Jarvis",
  description: "Personal trading & life companion",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="bg-slate-950 text-slate-100">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-xl bg-emerald-500/10 border border-emerald-400/40 flex items-center justify-center text-xs font-semibold text-emerald-300">
                J
              </div>
              <div>
                <div className="text-sm font-medium tracking-tight">
                  Trader Jarvis
                </div>
                <div className="text-[11px] text-slate-400">
                  Your trading & life companion
                </div>
              </div>
            </div>
            <nav className="flex items-center gap-3 text-xs sm:text-sm">
              <a
                href="/"
                className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-200"
              >
                Chat
              </a>
              <a
                href="/checkin"
                className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-200"
              >
                Check-in
              </a>
              <a
                href="/journal"
                className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-200"
              >
                Journal
              </a>
              <a
                href="/readiness"
                className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-200"
              >
                Readiness
              </a>
              <a
                href="/profile"
                className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-200"
              >
                Profile
              </a>
              <a
                href="/analyzer"
                className="px-2 py-1 rounded-lg hover:bg-slate-800 text-emerald-300 border border-emerald-500/40"
              >
                Trade Analyzer
              </a>
            </nav>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
