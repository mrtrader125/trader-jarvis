// src/app/api/jarvis/modules/update/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, slug, description } = body as {
      id: string;
      name?: string;
      slug?: string;
      description?: string;
    };

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing module id" },
        { status: 400 }
      );
    }

    const update: any = {};
    if (typeof name === "string") update.name = name.trim();
    if (typeof description === "string") update.description = description.trim();

    if (typeof slug === "string" && slug.trim()) {
      const cleanedSlug = slug
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "_");
      update.slug = cleanedSlug;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nothing to update" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("jarvis_knowledge_modules")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("[modules/update] error:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, module: data }, { status: 200 });
  } catch (err: any) {
    console.error("[modules/update] exception:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
