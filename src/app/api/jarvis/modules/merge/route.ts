// src/app/api/jarvis/modules/merge/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceId, targetId, deleteSource = true } = body as {
      sourceId: string;
      targetId: string;
      deleteSource?: boolean;
    };

    if (!sourceId || !targetId) {
      return NextResponse.json(
        { ok: false, error: "sourceId and targetId are required" },
        { status: 400 }
      );
    }

    if (sourceId === targetId) {
      return NextResponse.json(
        { ok: false, error: "sourceId and targetId cannot be the same" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 1) Move items from source module to target module
    const { error: updateError } = await supabase
      .from("jarvis_knowledge_items")
      .update({ module_id: targetId })
      .eq("module_id", sourceId);

    if (updateError) {
      console.error("[modules/merge] update error:", updateError.message);
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    // 2) Optionally delete the source module
    if (deleteSource) {
      const { error: deleteError } = await supabase
        .from("jarvis_knowledge_modules")
        .delete()
        .eq("id", sourceId);

      if (deleteError) {
        console.error("[modules/merge] delete error:", deleteError.message);
        return NextResponse.json(
          { ok: false, error: deleteError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("[modules/merge] exception:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
