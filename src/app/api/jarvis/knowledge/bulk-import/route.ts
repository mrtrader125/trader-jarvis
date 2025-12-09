// src/app/api/jarvis/knowledge/bulk-import/route.ts

import { NextRequest, NextResponse } from "next/server";
import {
  UpsertKnowledgeItemInput,
} from "@/lib/jarvis/knowledge/types";
import { upsertKnowledgeItem } from "@/lib/jarvis/knowledge/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw = String(body.raw ?? "");
    const format = String(body.format ?? "json-v1");

    if (!raw.trim()) {
      return NextResponse.json(
        { ok: false, error: "No data provided" },
        { status: 400 }
      );
    }

    if (format !== "json-v1") {
      return NextResponse.json(
        { ok: false, error: "Unsupported format. Use 'json-v1'." },
        { status: 400 }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid JSON. Make sure the text is valid JSON. You can use any AI to generate it, but the final text must be valid JSON.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "JSON root must be an array of items. Example: [ { ...rule1 }, { ...rule2 } ].",
        },
        { status: 400 }
      );
    }

    const createdIds: string[] = [];
    let index = 0;

    for (const item of parsed) {
      index++;

      // Basic validation
      if (!item.title || !item.content_markdown) {
        throw new Error(
          `Item #${index} missing 'title' or 'content_markdown'.`
        );
      }

      const input: UpsertKnowledgeItemInput = {
        // No id: always create new items in bulk mode
        moduleSlug: item.moduleSlug || "trading_psychology",
        title: String(item.title),
        content_markdown: String(item.content_markdown),
        jarvis_instructions: item.jarvis_instructions
          ? String(item.jarvis_instructions)
          : undefined,
        item_type: (item.item_type ||
          "rule") as UpsertKnowledgeItemInput["item_type"],
        tags: Array.isArray(item.tags)
          ? item.tags.map((t: any) => String(t))
          : [],
        importance:
          typeof item.importance === "number"
            ? item.importance
            : 3,
        status: (item.status || "active") as UpsertKnowledgeItemInput["status"],
      };

      const created = await upsertKnowledgeItem(input);
      createdIds.push(created.id);
    }

    return NextResponse.json(
      {
        ok: true,
        count: createdIds.length,
        ids: createdIds,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[knowledge/bulk-import] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}
