import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { setMatchupWinner } from "@/lib/planPoll";

// Captain action: call a matchup in the live bracket round by hand, overriding
// the vote — or send winner: null to hand it back to the tally. Nothing resolves
// until the captain advances the round.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  const viewer = { userId: session?.user?.id ?? null, email: session?.user?.email ?? null };

  const body = await req.json().catch(() => ({}));
  const result = await setMatchupWinner(id, viewer, body?.matchupId, body?.winner ?? null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.view);
}
