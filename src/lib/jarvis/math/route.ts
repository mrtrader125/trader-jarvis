// /app/api/jarvis/math/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MathTask, MathTaskResult, runMathTask } from "@/lib/jarvis/math";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const task = body as MathTask;

    const result: MathTaskResult = runMathTask(task);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error: any) {
    console.error("[/api/jarvis/math] error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 400 }
    );
  }
}
