// src/app/api/chat/route.ts
import type { NextApiRequest, NextApiResponse } from "next";

type ComposeResult = {
  messages?: Array<{ role: string; content: string }>;
  meta?: Record<string, any>;
};

async function tryLoadCompose(): Promise<((opts?: any) => Promise<ComposeResult>) | null> {
  try {
    const m = await import("@/lib/chat-composer").catch(() => null);
    if (m) {
      if (typeof m.compose === "function") return m.compose.bind(m);
      if (typeof m.composeAndCallJarvis === "function") return m.composeAndCallJarvis.bind(m);
      if (m.default && typeof m.default.compose === "function") return m.default.compose.bind(m.default);
    }
  } catch (e) {
    console.error("[chat route] compose import error:", String(e?.message ?? e));
  }
  try {
    const m2 = await import("@/lib/chat-composer-wrapper").catch(() => null);
    if (m2) {
      if (typeof m2.compose === "function") return m2.compose.bind(m2);
      if (m2.default && typeof m2.default.compose === "function") return m2.default.compose.bind(m2.default);
    }
  } catch {}
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const body = req.body ?? {};
  const callPayload = body;

  try {
    const composeFn = await tryLoadCompose();
    if (composeFn) {
      const maybeResult = await Promise.resolve(composeFn(callPayload));
      // normalize result
      const result = (await maybeResult) ?? { messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }], meta: {} };
      return res.status(200).json({ ok: true, data: result });
    }
  } catch (e) {
    console.error("[chat route] compose call failed:", String(e?.message ?? e));
  }

  // Fallback safe response
  return res.status(200).json({
    ok: true,
    data: { messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }], meta: {} },
  });
}
