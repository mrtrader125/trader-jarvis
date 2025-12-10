// src/lib/fetch-chat.ts
export interface ChatMessage {
  role: "user" | "assistant" | "system" | string;
  content: string;
}

export async function sendChat(messages: ChatMessage[], userId = "web") {
  const url = "/api/chat";

  const payload = {
    messages,
    userId,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  // try parse JSON safely
  try {
    const json = JSON.parse(text);
    if (!res.ok) {
      throw new Error(json?.error ?? `HTTP ${res.status}`);
    }
    return json;
  } catch (err) {
    // If JSON.parse fails, surface a useful error
    throw new Error(`Invalid JSON response from server: ${err instanceof Error ? err.message : String(err)} - raw: ${text}`);
  }
}
