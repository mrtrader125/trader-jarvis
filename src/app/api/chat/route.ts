// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNowInfo } from "@/lib/time";
import { groqClient } from "@/lib/groq";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body?.messages ?? [];

    const timezone = "Asia/Kolkata";
    const nowInfo = getNowInfo(timezone);

    const formatted = messages.map((m: any) => {
      const sentAt = m.createdAt || m.created_at || new Date().toISOString();
      return { role: m.role, content: `[sent_at: ${sentAt}] ${m.content}` };
    });

    const systemPrompt = `
You are Jarvis, a single-user trading companion.
Current time: ${nowInfo.localeString} (${nowInfo.timezone}).
Use timestamps and help the user structure discipline and trading decisions.
`.trim();

    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...formatted,
    ];

    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "mixtral-8x7b-32k",   // <— FIXED HERE
      messages: finalMessages,
      stream: false,
    });

    const reply = completion?.choices?.[0]?.message?.content || "No reply";

    return NextResponse.json({ reply }, { status: 200 });
  } catch (err: any) {
    console.error("CHAT API ERROR:", err);

    return NextResponse.json(
      { reply: "Jarvis brain crashed: " + err.message },
      { status: 200 }
    );
  }
}
