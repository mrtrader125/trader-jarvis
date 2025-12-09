// /app/api/jarvis/knowledge/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { upsertKnowledgeItem } from "@/lib/jarvis/knowledge/store";
import { UpsertKnowledgeItemInput } from "@/lib/jarvis/knowledge/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as UpsertKnowledgeItemInput;
    const item = await upsertKnowledgeItem(body);

    return NextResponse.json({ ok: true, item });
  } catch (err: any) {
    console.error("[knowledge/save] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 400 }
    );
  }
}
