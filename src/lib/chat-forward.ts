// src/lib/chat-forward.ts
// Helper to forward internal chat calls (server-side).
// Tries /api/chat-sync first (preferred plain-json endpoint for server-to-server calls).
// Falls back to /api/chat (streaming SSE) and attempts to extract text.

type Msg = { role: string; content: string };
type HandleArgs = { messages: Msg[]; userId: string };

function getBaseUrl() {
  // INTERNAL_BASE_URL should be set in env for local dev and CI.
  // Fallback to localhost with default port 3000.
  return process.env.INTERNAL_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

async function tryJsonEndpoint(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`chat-forward: ${url} returned ${res.status}: ${txt}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  // If not json, try text
  return res.text();
}

export async function handleIncomingChat({ messages, userId }: HandleArgs): Promise<string> {
  const base = getBaseUrl();

  // Try preferred sync endpoint
  const syncUrl = `${base}/api/chat-sync`;
  const payload = { messages, userId };

  try {
    // First try chat-sync (returns { text: "..." } or plain text)
    const result = await tryJsonEndpoint(syncUrl, payload);
    // Normalize result
    if (!result) return "";
    if (typeof result === "string") return result;
    if (typeof result === "object") {
      // common shapes: { text: '...' } or { reply: '...' }
      if ((result as any).text) return String((result as any).text);
      if ((result as any).reply) return String((result as any).reply);
      // maybe the full assistant content was returned as 'message' or similar
      if ((result as any).message) return String((result as any).message);
      // fallback to stringified JSON
      return JSON.stringify(result);
    }
    return String(result);
  } catch (err) {
    // fallback to streaming /api/chat
    try {
      const fallbackUrl = `${base}/api/chat`;
      const res = await fetch(fallbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`chat-forward fallback failed ${res.status}: ${txt}`);
      }

      // Attempt to read as text (SSE or plain text)
      const text = await res.text();

      // If the returned text is SSE-like (data: {"delta":"..."}) try to extract last data payload
      const sseMatches = Array.from(text.matchAll(/data:\s*(.+?)\\n\\n/gms)).map(m => m[1]);
      if (sseMatches.length) {
        // parse last
        try {
          const parsed = JSON.parse(sseMatches[sseMatches.length - 1]);
          if (parsed?.delta) return String(parsed.delta);
        } catch (e) {
          // ignore parse error, fallback to raw
        }
        return sseMatches.join("\\n");
      }

      // If plain text, return it
      return text;
    } catch (e) {
      console.warn("handleIncomingChat: both sync and fallback failed:", e);
      throw e;
    }
  }
}
