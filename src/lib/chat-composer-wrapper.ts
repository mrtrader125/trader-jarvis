/**
 * src/lib/chat-composer-wrapper.ts
 * Stable wrapper that tries to re-export a compose implementation.
 */

import * as maybe from "@/lib/chat-composer";

const compose = (maybe && typeof (maybe as any).compose === "function")
  ? (maybe as any).compose
  : async (opts?: any) => ({ messages: [{ role: "assistant", content: "Hi — Jarvis here. (Wrapper fallback)" }], meta: {} });

export const composeAndCallJarvis = compose;
export { compose };
export default { compose, composeAndCallJarvis };
