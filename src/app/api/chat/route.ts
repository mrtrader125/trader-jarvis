import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    console.log("[chat route] incoming body:", JSON.stringify(body?.messages?.slice?.(0,2) ?? body, null, 2));
    // Try to import your composer or wrapper
    let composeLib = null;
    try {
      composeLib = await import("@/lib/chat-composer").catch(() => null);
      if (!composeLib) composeLib = await import("@/lib/chat-composer").catch(() => null);
    } catch (e) {
      console.error("[chat route] composer import error:", e?.message ?? e);
    }

    // If a compose function exists, call it; otherwise return an informative fallback
    if (composeLib && (typeof composeLib.compose === "function" || typeof composeLib.default?.compose === "function" || typeof composeLib.composeAndCallJarvis === "function")) {
      const fn = composeLib.compose ?? composeLib.default?.compose ?? composeLib.composeAndCallJarvis;
      try {
        const result = await fn({ userId: body?.userId ?? "debug", messages: body?.messages ?? [] });
        console.log("[chat route] compose result keys:", result ? Object.keys(result) : result);
        return NextResponse.json({ ok: true, data: result });
      } catch (err) {
        console.error("[chat route] compose call error:", err?.stack ?? err?.message ?? err);
        return NextResponse.json({ ok: false, error: String(err?.message ?? err), data: { messages: [{ role: "assistant", content: "Something went wrong, but I'm still here. Try again in a bit." }] } }, { status: 500 });
      }
    }

    console.log("[chat route] no compose lib found — returning fallback");
    return NextResponse.json({ ok: true, data: { messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }] } });
  } catch (e) {
    console.error("[chat route] unexpected error:", e?.stack ?? e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e), data: { messages: [{ role: "assistant", content: "Something went wrong, but I'm still here. Try again in a bit." }] } }, { status: 500 });
  }
}
