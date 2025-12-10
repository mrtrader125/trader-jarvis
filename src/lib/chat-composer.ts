/**
 * Robust chat-composer probe + diagnostics
 *
 * This wrapper tries a list of candidate modules and export names,
 * logs attempts and the final resolution so we can see why the fallback
 * reply is being returned (which means no usable compose fn found or the
 * found fn threw).
 *
 * Server-side logs will appear in your local terminal (when running `next start`)
 * and in Vercel deployment logs.
 */

type AnyFn = (opts?: any) => Promise<any>;

async function tryImport(p: string) {
  try {
    // dynamic import - will resolve via Next's module resolution (ts -> compiled js)
    const mod: any = await import(p).catch(() => null);
    return mod ?? null;
  } catch (e) {
    return null;
  }
}

async function probe(candidates: string[], names: string[]) : Promise<{ fn: AnyFn | null, info: string }> {
  for (const p of candidates) {
    try {
      // try to import and inspect
      // Log attempted path
      // NOTE: console.error used intentionally so logs show in server logs
      console.error("[chat-composer-resolve] Trying import:", p);
      const mod: any = await tryImport(p);
      if (!mod) {
        console.error("[chat-composer-resolve] Not found:", p);
        continue;
      }
      // inspect named exports
      for (const n of names) {
        if (typeof mod[n] === "function") {
          console.error("[chat-composer-resolve] Found named export", n, "in", p);
          return { fn: mod[n].bind(mod), info: `${p} -> export ${n}` };
        }
        if (mod.default && typeof mod.default[n] === "function") {
          console.error("[chat-composer-resolve] Found default export object having", n, "in", p);
          return { fn: mod.default[n].bind(mod.default), info: `${p} -> default.${n}` };
        }
      }
      // default is function?
      if (typeof mod.default === "function") {
        console.error("[chat-composer-resolve] Found default function export in", p);
        return { fn: mod.default.bind(mod.default), info: `${p} -> default(fn)` };
      }
      // last ditch: any function export
      for (const key of Object.keys(mod)) {
        if (typeof mod[key] === "function") {
          console.error("[chat-composer-resolve] Falling back to any function export:", key, "in", p);
          return { fn: mod[key].bind(mod), info: `${p} -> export ${key}` };
        }
      }
      console.error("[chat-composer-resolve] Module imported but no function found in", p);
    } catch (err: any) {
      console.error("[chat-composer-resolve] Import error for", p, ":", String(err?.message ?? err));
      continue;
    }
  }
  return { fn: null, info: "no candidate resolved" };
}

export async function compose(opts?: any) {
  const candidates = [
    "@/lib/chat-composer",
    "@/lib/chat-composer-wrapper",
    "@/lib/chat-forward",
    "@/lib/chat-forward.ts",
    "@/lib/chat-composer.old",
    "@/lib/chat-composer.bak",
    "./chat-composer",
    "./chat-forward",
  ];

  const names = ["compose", "composeAndCallJarvis", "callJarvis", "composeAndCall", "default"];

  try {
    const res = await probe(candidates, names);
    if (res.fn) {
      console.error("[chat-composer-resolve] Using:", res.info);
      try {
        const result = await Promise.resolve(res.fn(opts));
        // log result shape for diagnostics (avoid printing massive content)
        try {
          if (result && result.messages && Array.isArray(result.messages)) {
            console.error("[chat-composer-resolve] Result messages length:", result.messages.length);
          } else {
            console.error("[chat-composer-resolve] Result shape:", typeof result);
          }
        } catch {}
        return result;
      } catch (callErr: any) {
        console.error("[chat-composer-resolve] Underlying compose threw:", String(callErr?.message ?? callErr));
        // continue to fallback
      }
    } else {
      console.error("[chat-composer-resolve] No compose resolved - falling back");
    }
  } catch (e: any) {
    console.error("[chat-composer-resolve] Unexpected error:", String(e?.message ?? e));
  }

  // fallback value (same as you were seeing)
  return {
    messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }],
    meta: {},
  };
}

export const composeAndCallJarvis = compose;
export default { compose, composeAndCallJarvis };
