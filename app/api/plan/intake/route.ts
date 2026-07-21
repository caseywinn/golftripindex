import { NextResponse } from "next/server";
import { getCaddieData } from "@/lib/caddieData";
import { runFilter } from "@/lib/tripFilter";
import { intakeToFilterArgs, type IntakeAnswers } from "@/lib/intake";

// POST /api/plan/intake — the trip planner's step-1 questionnaire.
// Deterministic: maps the answers to a runFilter query and returns the matching
// trip slugs in ranked order. No LLM, no second turn.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const answers: IntakeAnswers =
      body && typeof body === "object" ? (body.answers ?? body) : {};

    const pool = await getCaddieData();
    const results = runFilter(intakeToFilterArgs(answers), pool);

    return NextResponse.json({ slugs: results.map((t) => t.slug) });
  } catch (e: unknown) {
    console.error("[plan/intake]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
