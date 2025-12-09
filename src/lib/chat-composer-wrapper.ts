// src/lib/chat-composer-wrapper.ts
/**
 * Minimal wrapper that provides a stable compose export if your project
 * expects it. This file is intentionally tiny and returns a safe fallback.
 */

export async function compose(opts?: any) {
  // Small wrapper that tries to delegate to known real loaders (if present)
  try {
    const mod = await import("@/lib/chat-composer").catch(() => null);
    if (mod && typeof mod.compose === "function") {
      return mod.compose(opts);
    }
  } catch {}
  // fallback
  return { messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply)" }], meta: {} };
}

export const composeAndCallJarvis = compose;
export default { compose, composeAndCallJarvis };
