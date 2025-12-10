/**
 * src/lib/chat-composer-wrapper.ts
 * Simple wrapper that re-exports a compose implementation if present.
 *
 * Many places import different module shapes; this wrapper aims to provide
 * a stable default shape: export function compose(...) and default { compose }.
 */

import composeModule from "@/lib/chat-composer";

export const compose = (composeModule && typeof composeModule.compose === "function")
  ? composeModule.compose
  : (composeModule && typeof composeModule.default === "function")
    ? composeModule.default
    : async (opts?: any) => ({ messages: [{ role: "assistant", content: "Hi — Jarvis here. (Fallback reply from wrapper)" }], meta: {} });

export const composeAndCallJarvis = compose;
export default { compose, composeAndCallJarvis };
