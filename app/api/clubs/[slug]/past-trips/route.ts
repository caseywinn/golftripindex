import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import { createManualClubTrip } from "@/lib/clubTrips";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Manually add a past trip to a club's history — for trips that never went
 * through a vote. Owner/admin only.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in to add a trip." }, { status: 401 });
    }

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    // 404 (not 403) for a non-manager, matching the other club routes — a 403
    // would confirm a private club exists.
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const viewer = await getClubViewer(club.id, session.user.id, pool);
    if (!canManage(viewer)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? "").trim();
    const destination = body?.destination ? String(body.destination).trim() : null;
    const startDate = ISO_DATE.test(body?.startDate) ? String(body.startDate) : null;
    const endDate = ISO_DATE.test(body?.endDate) ? String(body.endDate) : null;
    // A GolfTrips slug when the destination was picked from autocomplete; junk or
    // free text stores no link (the picker sends null).
    const destinationSlug =
      typeof body?.destinationSlug === "string" && /^[a-z0-9-]{1,100}$/.test(body.destinationSlug)
        ? body.destinationSlug
        : null;

    const result = await createManualClubTrip(
      { clubId: club.id, createdBy: session.user.id, title, destination, destinationSlug, startDate, endDate },
      pool
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ tripId: result.tripId }, { status: 201 });
  } catch (err) {
    console.error("[clubs/past-trips] create error:", err);
    return NextResponse.json({ error: "Could not add the trip. Try again." }, { status: 500 });
  }
}
