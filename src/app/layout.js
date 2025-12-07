import "./globals.css";

export const metadata = {
  title: "JARVIS V1 | Trader Companion",
  description: "Your personal trading, mindset & life companion.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
