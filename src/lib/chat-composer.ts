// src/lib/chat-composer.ts
// Robust chat composer for Jarvis.
// - Default export composes messages for the LLM
// - Uses memoryLib safely (supports getRelevantMemories, fetchRelevantMemories, fetchMemoryForUser)
// - Uses jarvisPersona and mathEngine if present
// - Defensive / TypeScript-friendly

import { groqClient } from "@/lib/groq";
import jarvisPersona from "@/lib/jarvis-persona";
import * as memoryLibImport from "./jarvis-memory";
import * as mathEngine from "./math-engine";

type Role = "user" | "assistant" | "system";
type Msg = { role: Role; content: string; ts?: string };

type ComposeOpts = {
  userId: string;
  messages?: Msg[]; // conversation messages (most recent last)
  memoryLimit?: number;
  memoryMaxAgeDays?: number;
  verbose?: boolean;
};

function normalizeMessages(input?: Msg[] | { role: string; content: string }[]) {
  if (!input || !Array.isArray(input)) return [];
  return input.map((m) => {
    // coerce role to allowed union; default to 'user' if unknown
    const role = (m as any).role;
    const safeRole: Role = role === "assistant" || role === "system" ? (role as Role) : "user";
    return { role: safeRole, content: String((m as any).content ?? ""), ts: (m as any).ts };
  });
}

// pick the best memory fetch function available
const memoryLib: any = (memoryLibImport as any).default ?? memoryLibImport;
async function fetchRelevant(userId: string, memoryLimit = 6, maxAgeDays?: number) {
  try {
    if (!memoryLib) return [];
    // prefer getRelevantMemories alias if available
    if (typeof memoryLib.getRelevantMemories === "function") {
      return await memoryLib.getRelevantMemories(userId, null, maxAgeDays ?? null, memoryLimit);
    }
    if (typeof memoryLib.fetchRelevantMemories === "function") {
      return await memoryLib.fetchRelevantMemories(userId, null, maxAgeDays ?? null, memoryLimit);
    }
    if (typeof memoryLib.fetchMemoryForUser === "function") {
      return await memoryLib.fetchMemoryForUser(userId, { limit: memoryLimit });
    }
    return [];
  } catch (e) {
    console.warn("fetchRelevant memory error:", e);
    return [];
  }
}

function buildMemoryPreface(memRows: any[]) {
  if (!memRows || memRows.length === 0) return "";
  // Defensive: each row may have summary or data.summary or summary in data
  const lines = memRows.map((m: any, i: number) => {
    const summary =
      m?.summary ??
      (m?.data && (m.data.summary || m.data.text || m.data.note)) ??
      (typeof m === "string" ? m : JSON.stringify(m).slice(0, 200));
    return `${i + 1}. ${String(summary).replace(/\s+/g, " ").trim()}`;
  });
  return `Relevant memories (most relevant first):\n${lines.join("\n")}\n\n`;
}

function buildSystemPrompt(userId: string, memoryPreface: string) {
  const personaText =
    (jarvisPersona && (jarvisPersona as any).summary) ||
    (jarvisPersona && typeof jarvisPersona === "string" ? jarvisPersona : null) ||
    "You are Jarvis, a concise, factual trading assistant. Speak clearly and helpfully.";
  const now = new Date().toISOString();
  return `${personaText}\nUser: ${userId}\nTime: ${now}\n\n${memoryPreface}Respond concisely and with numeric accuracy when relevant.`;
}

export default async function composeChat(opts: ComposeOpts) {
  const userId = opts.userId;
  const memoryLimit = opts.memoryLimit ?? 6;
  const maxAgeDays = opts.memoryMaxAgeDays;

  const convo = normalizeMessages(opts.messages);
  // fetch relevant memories
  const memRows = await fetchRelevant(userId, memoryLimit, maxAgeDays);
  const memoryPreface = buildMemoryPreface(memRows);

  const systemPrompt = buildSystemPrompt(userId, memoryPreface);

  // final composed messages: system prompt, then the recent convo (limit last 12 msgs)
  const recent = convo.slice(-12).map((m) => ({ role: m.role, content: m.content }));
  const composed: Msg[] = [{ role: "system", content: systemPrompt }, ...recent];

  return {
    messages: composed,
    meta: {
      memoryCount: Array.isArray(memRows) ? memRows.length : 0,
      memoryRows: memRows,
    },
  };
}