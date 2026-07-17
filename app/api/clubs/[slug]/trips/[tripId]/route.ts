import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import { setClubTripStatus, type TripAction } from "@/lib/clubTrips";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAction(v: unknown): v is TripAction {
  return v === "complete" || v === "archive";
}

/**
 * Move a club trip out of the open set. Owner/admin only.
 *
 * `complete` = we played it (lands in Previous trips). `archive` = shelved, and
 * the club's escape hatch — a tied poll or a mistaken proposal otherwise blocks
 * every future proposal, since only one trip may be open at a time.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string; tripId: string }> }) {
  try {
    const { slug, tripId } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    // The id is a path segment, so it's arbitrary text. Postgres would raise
    // "invalid input syntax for type uuid" and surface as a 500.
    if (!UUID_RE.test(tripId)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    // 404 not 403 for a non-manager — a 403 would confirm a private club exists.
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const viewer = await getClubViewer(club.id, session.user.id, pool);
    if (!canManage(viewer)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    if (!isAction(body?.action)) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    // setClubTripStatus scopes its UPDATE by club_id too, so a manager of one
    // club can't act on another club's trip by guessing an id.
    const result = await setClubTripStatus(club.id, tripId, body.action, pool);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[clubs/trips/:id] error:", err);
    return NextResponse.json({ error: "Could not update the trip." }, { status: 500 });
  }
}
