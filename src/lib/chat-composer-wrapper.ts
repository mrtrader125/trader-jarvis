import * as real from "@/lib/chat-composer";
const exportedAny: any = real;
export const compose = exportedAny.compose ?? exportedAny.default ?? exportedAny.composeAndCallJarvis ?? (opts => Promise.resolve({ messages: [{ role:"assistant", content: "Hi — fallback" }] }));
export default { compose };
