// app/api/compare/pack/route.ts
import { NextResponse } from "next/server";
import { buildComparisonPack } from "@/lib/compare/buildComparisonPack";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const A = searchParams.get("A");
  const B = searchParams.get("B");
  if (!A || !B) return NextResponse.json({ error: "Missing A or B" }, { status: 400 });

  const pack = await buildComparisonPack(A, B);
  if (!pack) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  return NextResponse.json(pack);
}
