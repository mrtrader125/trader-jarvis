// /app/api/jarvis/knowledge/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listKnowledgeItems } from "@/lib/jarvis/knowledge/fetch";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const moduleSlug = searchParams.get("moduleSlug") ?? undefined;
    const status = searchParams.get("status") ?? "active";

    const items = await listKnowledgeItems({
      moduleSlug,
      status: status as any,
      limit: 100,
    });

    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    console.error("[knowledge/list] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 400 }
    );
  }
}
