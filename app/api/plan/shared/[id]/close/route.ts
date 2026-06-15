import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { closePoll } from "@/lib/planPoll";

// Captain action: close the vote now and reveal results (manual override of the
// auto-close-when-everyone-votes rule).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  const viewer = { userId: session?.user?.id ?? null, email: session?.user?.email ?? null };

  const result = await closePoll(id, viewer);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.view);
}
