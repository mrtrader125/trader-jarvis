// src/lib/groq.ts
import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY in environment variables");
}

// Single Groq client instance for the whole app
export const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});
