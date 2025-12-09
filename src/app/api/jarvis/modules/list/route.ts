// src/app/api/jarvis/modules/list/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("jarvis_knowledge_modules")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("[modules/list] error:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, modules: data ?? [] },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[modules/list] exception:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
