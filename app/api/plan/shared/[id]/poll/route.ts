import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildPollView } from "@/lib/planPoll";

// Current poll state for the viewer: config, who's voted, their ballot, and
// (once closed) results. Claims the viewer's roster seat as a side effect.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  const viewer = { userId: session?.user?.id ?? null, email: session?.user?.email ?? null };

  const view = await buildPollView(id, viewer);
  if (!view) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(view);
}
