// src/lib/chat-composer.ts
/**
 * Robust chat-composer probe + diagnostics
 *
 * Probes candidate modules/exports for a compose-style function. If none found,
 * returns a safe fallback.
 */

type AnyFn = (opts?: any) => Promise<any>;

async function tryImport(path: string) {
  try {
    const mod: any = await import(path).catch(() => null);
    return mod ?? null;
  } catch (e) {
    return null;
  }
}

async function probe(paths: string[], names: string[]): Promise<{ fn: AnyFn | null; info: string }> {
  for (const p of paths) {
    try {
      console.error("[chat-composer] trying", p);
      const m: any = await tryImport(p);
      if (!m) {
        console.error("[chat-composer] not found:", p);
        continue;
      }
      for (const n of names) {
        if (typeof m[n] === "function") {
          console.error("[chat-composer] found", n, "in", p);
          return { fn: m[n].bind(m), info: `${p} -> export ${n}` };
        }
        if (m.default && typeof m.default[n] === "function") {
          console.error("[chat-composer] found default." + n + " in", p);
          return { fn: m.default[n].bind(m.default), info: `${p} -> default.${n}` };
        }
      }
      if (typeof m.default === "function") {
        console.error("[chat-composer] default function in", p);
        return { fn: m.default.bind(m.default), info: `${p} -> default(fn)` };
      }
      for (const key of Object.keys(m)) {
        if (typeof m[key] === "function") {
          console.error("[chat-composer] fallback function", key, "in", p);
          return { fn: m[key].bind(m), info: `${p} -> export ${key}` };
        }
      }
      console.error("[chat-composer] module imported but no function found:", p);
    } catch (err: any) {
      console.error("[chat-composer] import error for", p, ":", String(err?.message ?? err));
    }
  }
  return { fn: null, info: "no candidate resolved" };
}

export async function compose(opts?: any) {
  const candidates = [
    "@/lib/chat-forward",
    "@/lib/chat-composer",
    "@/lib/chat-composer-wrapper",
    "@/lib/chat-composer.old",
    "./chat-forward",
    "./chat-composer",
  ];
  const names = ["compose", "composeAndCallJarvis", "callJarvis", "composeAndCall", "default"];

  try {
    const res = await probe(candidates, names);
    if (res.fn) {
      console.error("[chat-composer] using:", res.info);
      try {
        const out = await Promise.resolve(res.fn(opts));
        try {
          if (out && Array.isArray(out.messages)) {
            console.error("[chat-composer] result messages length:", out.messages.length);
          } else {
            console.error("[chat-composer] result shape:", typeof out);
          }
        } catch {}
        return out;
      } catch (callErr: any) {
        console.error("[chat-composer] underlying compose threw:", String(callErr?.message ?? callErr));
      }
    } else {
      console.error("[chat-composer] no compose resolved - fallback");
    }
  } catch (e: any) {
    console.error("[chat-composer] unexpected error:", String(e?.message ?? e));
  }

  return { messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }], meta: {} };
}

export const composeAndCallJarvis = compose;
export default { compose, composeAndCallJarvis };
