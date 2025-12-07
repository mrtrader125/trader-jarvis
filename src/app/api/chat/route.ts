// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNowInfo } from "@/lib/time";
import { groqClient } from "@/lib/groq";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: string;
  created_at?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: ChatMessage[] = body?.messages ?? [];

    // ---- 1) Setup Supabase (single-user mode) ----
    const supabase = createClient();
    const userId = "single-user";

    // ---- 2) Try to load Jarvis profile (but don't crash if missing) ----
    let profile: any = null;
    try {
      const { data, error } = await supabase
        .from("jarvis_profile")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("Error loading jarvis_profile:", error.message);
      } else {
        profile = data;
      }
    } catch (err) {
      console.error("Exception while loading jarvis_profile:", err);
    }

    const timezone: string = profile?.timezone || "Asia/Kolkata";

    // ---- 3) Current time info for Jarvis ----
    const nowInfo = getNowInfo(timezone);

    // ---- 4) Attach timestamps to each message ----
    const messagesWithTime = messages.map((m) => {
      const sentAt =
        m.createdAt ||
        m.created_at ||
        new Date().toISOString();

      return {
        role: m.role,
        content: `[sent_at: ${sentAt}] ${m.content}`,
      };
    });

    // ---- 5) System prompt (Jarvis personality + time awareness) ----
    const systemPrompt = `
You are Jarvis, a long-term trading and life companion for ONE user in SINGLE-USER mode.
The user id is "single-user". There is no authentication or multi-user context.

Current real-world time:
- ISO: ${nowInfo.iso}
- Local: ${nowInfo.localeString}
- Timezone: ${nowInfo.timezone}

User routine (from jarvis_profile, if available):
- Typical wake time: ${profile?.typical_wake_time ?? "unknown"}
- Typical sleep time: ${profile?.typical_sleep_time ?? "unknown"}
- Trading session: ${profile?.trading_session_start ?? "unknown"} - ${
      profile?.trading_session_end ?? "unknown"
    }

Personality:
- Strictness level: ${profile?.strictness_level ?? 7}/10
- Empathy level: ${profile?.empathy_level ?? 7}/10
- Humor level: ${profile?.humor_level ?? 5}/10

Rules:
- Always use the user's local time (timezone) when talking about "now", morning, night, etc.
- Use [sent_at: ...] tags on messages to reason about how much time passed between events.
- If the user was away from the market for a while, you can estimate roughly how long based on timestamps.
- You are a supportive but honest companion: keep the user aligned with their rules and goals.
`.trim();

    const finalMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messagesWithTime,
    ];

    // ---- 6) Call Groq LLM ----
    const completion = await groqClient.chat.completions.create({
      model: "mixtral-8x7b-32768", // change if you're using another model
      messages: finalMessages,
      stream: false,
    });

    const replyMessage = completion.choices?.[0]?.message as any;

    const replyContent =
      typeof replyMessage?.content === "string"
        ? replyMessage.content
        : Array.isArray(replyMessage?.content)
        ? replyMessage.content
            .map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
            .join("\n")
        : "Sorry, I couldn't generate a response.";

    // ---- 7) Return JSON to the frontend ----
    return NextResponse.json(
      {
        reply: replyContent,
        raw: replyMessage,
        now: nowInfo,
        profileUsed: !!profile,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in /api/chat:", error);
    const message =
      error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: "Jarvis brain API crashed.",
        details: message,
      },
      { status: 500 }
    );
  }
}
