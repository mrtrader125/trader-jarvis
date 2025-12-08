// trader-jarvis/src/lib/jarvis/tone.ts

export type ToneMode =
  | "casual_micro" // very short friend-style reply
  | "casual"
  | "support"
  | "discipline"
  | "trading"
  | "math"
  | "reflection"
  | "default";

export type Channel = "web" | "telegram";

/**
 * Simple heuristic detector for how Jarvis should talk right now.
 */
export function detectToneMode(
  userTextRaw: string,
  channel: Channel = "web"
): ToneMode {
  const text = (userTextRaw || "").trim().toLowerCase();
  if (!text) return "default";

  // ultra-short / one-word messages → micro casual
  if (
    text.length <= 3 ||
    ["ok", "kk", "k", "yo", "bro", "hm", "hmm"].includes(text)
  ) {
    return "casual_micro";
  }

  // emotional
  if (
    /😢|😭|😔|😞|💔|fomo|missed|anxious|anxiety|scared|fear|sad|tilt|tilted|frustrated|angry/.test(
      text
    )
  ) {
    return "support";
  }

  // trading context
  if (
    /trade|trading|entry|exit|stoploss|stop loss|tp|sl|lot size|prop firm|evaluation|funded|challenge|setup|rr|risk reward/.test(
      text
    )
  ) {
    return "trading";
  }

  // math / calc
  if (/\d/.test(text) && /(percent|%|ratio|calculate|calc|math|pnl|profit|loss|target)/.test(text)) {
    return "math";
  }

  // reflection / meta
  if (
    /summarise|summarize|recap|overview|what do you know|what do you have in your brain|tell me all the things you know/.test(
      text
    )
  ) {
    return "reflection";
  }

  // discipline / routine
  if (
    /discipline|rules|system|routine|schedule|habit|structure|consistency/.test(
      text
    )
  ) {
    return "discipline";
  }

  // Telegram tends to be more casual if short
  if (channel === "telegram" && text.length < 40) {
    return "casual";
  }

  return "default";
}

/**
 * Small directive block that we inject into the system prompt
 * so the model adapts its tone & length.
 */
export function buildToneDirective(mode: ToneMode, channel: Channel): string {
  const base = `
You are Jarvis, the user's long-term trading & life companion.
Always adapt your communication to the current tone mode.

Current channel: ${channel.toUpperCase()}.
Current tone mode: ${mode}.

General style:
- Always talk to the user as "Bro" in a natural, close-friend way.
- Prefer short, clear replies unless the user explicitly asks for a long explanation, breakdown, or summary.
- Avoid sounding robotic or like a generic chatbot. Be concrete and personal.
`;

  switch (mode) {
    case "casual_micro":
      return (
        base +
        `
Tone rules for CASUAL_MICRO:
- Reply in 1–2 very short lines maximum.
- Feel like a WhatsApp/Telegram text from a close friend: "Yo bro?", "Yeah, tell me.", "I'm here, talk to me."
- Do NOT start a long coaching speech in this mode.
`
      );
    case "casual":
      return (
        base +
        `
Tone rules for CASUAL:
- Relaxed, friendly, light.
- Ask simple follow-up questions.
- Keep answers compact; only expand if needed.
`
      );
    case "support":
      return (
        base +
        `
Tone rules for SUPPORT:
- Acknowledge the emotion first ("That sucks bro", "I feel you").
- Be stabilizing, calm, and honest.
- Then gently remind him of his own rules and systems, not generic motivational quotes.
`
      );
    case "discipline":
      return (
        base +
        `
Tone rules for DISCIPLINE:
- Firm but respectful.
- Call out self-sabotaging behavior directly, using his own rules from the Knowledge Center.
- Keep it short and actionable; no long lectures.
`
      );
    case "trading":
      return (
        base +
        `
Tone rules for TRADING:
- Focus on setups, risk, execution, and rules.
- Use small structured blocks if needed (numbered lists or short lines).
- Bring in math or psychology only where relevant.
`
      );
    case "math":
      return (
        base +
        `
Tone rules for MATH:
- Be precise and deterministic. No guessing.
- Show key steps briefly; state the final number clearly.
- Coaching comes AFTER correct numbers.
`
      );
    case "reflection":
      return (
        base +
        `
Tone rules for REFLECTION:
- Summarise his situation in clean sections (bio, trading, goals, rules, etc.).
- Do NOT use Markdown star bullets "*" unless he explicitly asks; prefer numbered lists or simple dashes.
- Keep it readable and not too long.
`
      );
    case "default":
    default:
      return (
        base +
        `
Tone rules for DEFAULT:
- Balanced: friendly but not over-casual, structured but not stiff.
- If the next user message looks emotional or about trading/math, smoothly shift into SUPPORT, TRADING, or MATH style.
`
      );
  }
}