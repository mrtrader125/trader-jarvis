// src/app/api/telegram/processPending/route.ts
/**
 * Lightweight processPending route.
 * Designed to be safe: tries to load a compose function and call it for a test payload.
 * In your full project you may replace with the richer implementation that interacts with Supabase and Telegram.
 */

import type { NextApiRequest, NextApiResponse } from "next";

async function loadCompose() {
  try {
    const m = await import("@/lib/chat-composer").catch(() => null);
    if (m) {
      if (typeof m.compose === "function") return m.compose.bind(m);
      if (m.default && typeof m.default.compose === "function") return m.default.compose.bind(m.default);
    }
  } catch (e) {
    console.error("[processPending] compose import error:", String(e?.message ?? e));
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  try {
    const compose = await loadCompose();
    if (!compose) {
      console.error("[processPending] no compose available - nothing to process");
      return res.status(200).json({ ok: true, processed: 0 });
    }

    // Minimal safe behavior: call compose with a small diagnostic payload
    const payload = { messages: [{ role: "system", content: "processPending heartbeat" }], debug: true };
    const out = await Promise.resolve(compose(payload)).catch((e) => {
      console.error("[processPending] compose call error:", String(e?.message ?? e));
      return null;
    });

    if (out && Array.isArray(out.messages)) {
      return res.status(200).json({ ok: true, processed: 0, debug: { messages: out.messages.length } });
    }

    return res.status(200).json({ ok: true, processed: 0 });
  } catch (e) {
    console.error("[processPending] unexpected error:", String(e?.message ?? e));
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
