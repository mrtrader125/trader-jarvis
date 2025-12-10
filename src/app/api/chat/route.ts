/**
 * src/app/api/chat/route.ts
 * Minimal robust chat route.
 */

import { NextResponse } from "next/server";

type Msg = { role: string; content: string };
type CallPayload = { messages?: Msg[]; userId?: string; meta?: any };

async function tryLoadComposer() {
  try {
    const mod: any = await import("@/lib/chat-composer").catch(() => null);
    if (!mod) return null;
    if (typeof mod.compose === "function") return mod.compose;
    if (typeof mod.composeAndCallJarvis === "function") return mod.composeAndCallJarvis;
    if (mod.default && typeof mod.default.compose === "function") return mod.default.compose;
  } catch (e) {
    console.error("[chat route] load composer error:", String(e));
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const payload: CallPayload = { messages: body.messages ?? [], userId: body.userId ?? "unknown", meta: body.meta ?? {} };

    const composeFn = await tryLoadComposer();
    if (composeFn) {
      try {
        const result = await Promise.resolve(composeFn(payload));
        if (result && Array.isArray(result.messages)) {
          return NextResponse.json({ ok: true, data: result }, { status: 200 });
        }
        return NextResponse.json({ ok: true, data: result ?? { messages: [] } }, { status: 200 });
      } catch (err: any) {
        console.error("[chat route] compose threw:", String(err?.message ?? err));
      }
    } else {
      console.error("[chat route] no compose function found; returning fallback");
    }

    // fallback
    return NextResponse.json({ ok: true, data: { messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }], meta: {} } }, { status: 200 });
  } catch (e: any) {
    console.error("[chat route] unexpected:", String(e?.message ?? e));
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export const runtime = "nodejs";
