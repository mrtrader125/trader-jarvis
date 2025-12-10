/**
 * src/app/api/chat/route.ts
 * Minimal, robust chat route for Jarvis.
 * Accepts POST with JSON body: { messages: [...], userId: "..." }
 * Uses src/lib/chat-composer.ts (compose) if available; falls back to safe reply.
 */

import { NextResponse } from "next/server";

type Msg = { role: string; content: string };
type CallPayload = { messages?: Msg[]; userId?: string; meta?: any };

async function tryLoadComposer() {
  try {
    const mod: any = await import("@/lib/chat-composer").catch(() => null);
    if (mod && typeof mod.compose === "function") return mod.compose;
    if (mod && typeof mod.default === "object" && typeof mod.default.compose === "function") return mod.default.compose;
    if (mod && typeof mod.composeAndCallJarvis === "function") return mod.composeAndCallJarvis;
  } catch (e) { /* ignore */ }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const payload: CallPayload = {
      messages: body.messages ?? [],
      userId: body.userId ?? "unknown",
      meta: body.meta ?? {},
    };

    const composeFn = await tryLoadComposer();
    if (composeFn) {
      try {
        const result = await Promise.resolve(composeFn(payload));
        // If result is a streaming-like object with 'messages' prop, normalize:
        if (result && Array.isArray(result.messages)) {
          return NextResponse.json({ ok: true, data: result }, { status: 200 });
        }
        // otherwise assume the returned value is already good
        return NextResponse.json({ ok: true, data: result ?? { messages: [] } }, { status: 200 });
      } catch (err: any) {
        console.error("[chat route] compose threw:", String(err?.message ?? err));
      }
    } else {
      console.error("[chat route] no compose function found, returning fallback");
    }

    // fallback
    return NextResponse.json({
      ok: true,
      data: { messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }], meta: {} }
    }, { status: 200 });

  } catch (e: any) {
    console.error("[chat route] unexpected error:", String(e?.message ?? e));
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export const runtime = "nodejs";
