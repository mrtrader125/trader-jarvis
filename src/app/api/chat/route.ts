// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNowInfo } from "@/lib/time";
import { groqClient } from "@/lib/groq"; // your existing client

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages } = body; 
  // messages: [{ role: 'user' | 'assistant' | 'system', content: string, createdAt?: string }, ...]

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1) Load Jarvis profile
  const { data: profile, error: profileError } = await supabase
    .from("jarvis_profile")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (profileError) {
    console.error("Error loading jarvis_profile", profileError);
  }

  const timezone = profile?.timezone || "Asia/Kolkata";

  // 2) Get current time info
  const nowInfo = getNowInfo(timezone);

  // 3) Wrap messages with timestamps (so LLM knows WHEN each message happened)
  const messagesWithTime = messages.map((m: any) => {
    const sentAt =
      m.createdAt ||
      m.created_at ||
      new Date().toISOString(); // fallback if not provided

    return {
      role: m.role,
      content: `[sent_at: ${sentAt}] ${m.content}`,
    };
  });

  // 4) Build system prompt including time awareness + profile
  const systemPrompt = `
You are Jarvis, a long-term trading and life companion for ONE user.

Current real-world time:
- ISO: ${nowInfo.iso}
- Local: ${nowInfo.localeString}
- Timezone: ${nowInfo.timezone}

User routine (from jarvis_profile):
- Typical wake time: ${profile?.typical_wake_time || "unknown"}
- Typical sleep time: ${profile?.typical_sleep_time || "unknown"}
- Trading session: ${profile?.trading_session_start || "?"} - ${profile?.trading_session_end || "?"}

Personality:
- Strictness level: ${profile?.strictness_level ?? 7}/10
- Empathy level: ${profile?.empathy_level ?? 7}/10
- Humor level: ${profile?.humor_level ?? 5}/10

Rules:
- Always reason with time. If the user says "I'm at the beach now", use the [sent_at: ...] tag to know WHEN that was.
- If a new message happens long after a past one, you may say how long it's been (approx) since that event.
- Use the user's local time for any references (morning, night, etc.), not UTC.
`;

  const finalMessages = [
    { role: "system", content: systemPrompt },
    ...messagesWithTime,
  ];

  // 5) Call Groq (pseudo-code, adapt to your actual client)
  const response = await groqClient.chat.completions.create({
    model: "mixtral-8x7b-32768",
    messages: finalMessages,
    stream: false, // or true if you're streaming
  });

  return NextResponse.json({ reply: response.choices[0].message });
}
