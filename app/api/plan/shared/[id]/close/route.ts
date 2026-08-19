import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { closePoll } from "@/lib/planPoll";

// Captain action: close out the vote after reviewing it. Nothing closes or
// advances without this call. The body carries whatever the captain decided in
// the review modal: `overrides` (a bracket's per-matchup calls) or `winner` (a
// one-shot vote's called winner). Both optional — agreeing with the vote sends
// nothing.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  const viewer = { userId: session?.user?.id ?? null, email: session?.user?.email ?? null };

  const body = await req.json().catch(() => ({}));
  const result = await closePoll(id, viewer, { overrides: body?.overrides, winner: body?.winner });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.view);
}
