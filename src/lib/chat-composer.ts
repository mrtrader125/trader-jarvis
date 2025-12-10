/**
 * src/lib/chat-composer.ts
 * Robust probe + diagnostics for a compose function.
 */

type AnyFn = (opts?: any) => Promise<any>;

async function tryImport(p: string) {
  try { const mod: any = await import(p).catch(() => null); return mod ?? null; } catch { return null; }
}

async function probe(candidates: string[], names: string[]) : Promise<{ fn: AnyFn | null, info: string }> {
  for (const p of candidates) {
    try {
      console.error("[chat-composer] trying:", p);
      const mod: any = await tryImport(p);
      if (!mod) { console.error("[chat-composer] not found:", p); continue; }
      for (const n of names) {
        if (typeof mod[n] === "function") return { fn: mod[n].bind(mod), info: `${p} -> export ${n}` };
        if (mod.default && typeof mod.default[n] === "function") return { fn: mod.default[n].bind(mod.default), info: `${p} -> default.${n}` };
      }
      if (typeof mod.default === "function") return { fn: mod.default.bind(mod.default), info: `${p} -> default(fn)` };
      for (const key of Object.keys(mod)) { if (typeof mod[key] === "function") return { fn: mod[key].bind(mod), info: `${p} -> export ${key}` }; }
      console.error("[chat-composer] module has no function exports:", p);
    } catch (err: any) { console.error("[chat-composer] import error for", p, String(err?.message ?? err)); continue; }
  }
  return { fn: null, info: "no candidate resolved" };
}

export async function compose(opts?: any) {
  const candidates = ["@/lib/chat-composer", "@/lib/chat-composer-wrapper", "@/lib/chat-forward", "./chat-forward", "./chat-composer"];
  const names = ["compose", "composeAndCallJarvis", "callJarvis", "composeAndCall", "default"];

  try {
    const res = await probe(candidates, names);
    if (res.fn) {
      console.error("[chat-composer] resolved:", res.info);
      try {
        const result = await Promise.resolve(res.fn(opts));
        try { if (result && Array.isArray(result.messages)) console.error("[chat-composer] messages len:", result.messages.length); } catch {}
        return result;
      } catch (callErr: any) { console.error("[chat-composer] underlying threw:", String(callErr?.message ?? callErr)); }
    } else {
      console.error("[chat-composer] no compose resolved - fallback");
    }
  } catch (e: any) { console.error("[chat-composer] unexpected:", String(e?.message ?? e)); }

  return { messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }], meta: {} };
}

export const composeAndCallJarvis = compose;
export default { compose, composeAndCallJarvis };
