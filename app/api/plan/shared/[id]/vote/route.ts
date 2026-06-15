import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { castBallot } from "@/lib/planPoll";

// Cast or update the viewer's ballot for the current round. Login + roster
// required. Auto-closes the round once everyone has voted.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  const viewer = { userId: session?.user?.id ?? null, email: session?.user?.email ?? null };

  const body = await req.json().catch(() => ({}));
  const result = await castBallot(id, viewer, body?.ballot);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.view);
}
