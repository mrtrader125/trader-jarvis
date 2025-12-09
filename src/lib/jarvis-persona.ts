// src/lib/jarvis-persona.ts


- Tone: concise, polite, mildly witty (one-line dry humor allowed), never emotional, never apologetic unnecessarily.
- Brevity: Prefer short, direct answers. Use bullets for steps. If user asks for detail, expand.
- Context: Always use stored memory when relevant. If unsure, state the uncertainty and provide options (run check / use memory / skip).
- Math: Never compute trading math in natural language. Delegate all numeric calculations to the deterministic math engine. Validate computed numbers back into answer.
- Smalltalk: Avoid smalltalk unless user explicitly requests it. If user starts smalltalk, redirect to task after one brief reply.
- Permissions: Ask for confirm only for destructive or account-level actions (deleting memory, executing trades).


Examples:
- "Run system check." → "System check complete. CPU 11%, DB: ok, last snapshot: 2025-12-09 16:30. Anything specific?"
- "How much position size?" → "Calculated size: 1.28% of equity (₹1,280). Details: [calc]. Accept?"
`;


export function buildSystemPrompt(extraGuidelines?: string) {
return `${JARVIS_PERSONA}\n${extraGuidelines ?? ''}`;
}


// Helper to format memory chunks for prompt injection
export function formatMemoryAsPromptChunk(mem: { id: string; title: string; content: any; importance?: number; tags?: string[] }) {
const importance = mem.importance ?? 1;
const tags = (mem.tags ?? []).join(', ');
// keep chunks small; stringify content but truncate if too large
let contentStr = '';
try { contentStr = typeof mem.content === 'string' ? mem.content : JSON.stringify(mem.content); } catch (e) { contentStr = String(mem.content); }
if (contentStr.length > 1200) contentStr = contentStr.slice(0, 1200) + '...';
return `MEMORY_ID:${mem.id} | TITLE:${mem.title} | IMPORTANCE:${importance} | TAGS:${tags}\n${contentStr}`;
}


export function buildPromptInput({ systemPrompt, memoryChunks, convoHistory, instruction } : {
systemPrompt: string;
memoryChunks: string[]; // preformatted memory chunk strings
convoHistory: { role: 'user' | 'assistant' | 'system'; content: string; ts?: string }[];
instruction: string;
}) {
// Compose a single string prompt with clear separators (Groq may accept messages; adapt as needed)
const header = `### SYSTEM:\n${systemPrompt}\n---\n`;
const memorySection = memoryChunks && memoryChunks.length ? `### RELEVANT_MEMORIES:\n${memoryChunks.join('\n---\n')}\n---\n` : '';
const convo = convoHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
const convoSection = `### CONVERSATION:\n${convo}\n---\n`;
const instr = `### INSTRUCTION:\n${instruction}\n`;
return `${header}${memorySection}${convoSection}${instr}`;
}


// Small helper to extract provenance tokens that we later attach to responses
export function makeProvenanceTag(memId: string) {
return `source:memory:${memId}`;
}


export default {
JARVIS_PERSONA,
buildSystemPrompt,
formatMemoryAsPromptChunk,
buildPromptInput,
makeProvenanceTag,
};