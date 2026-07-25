import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import {
  setClubTripStatus,
  updateClubTripRecap,
  type TripAction,
  type TripCourse,
  type TripAttendee,
  type TripVisibility,
} from "@/lib/clubTrips";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAction(v: unknown): v is TripAction {
  return v === "complete" || v === "archive";
}

/** Coerce a client-sent courses array into trusted shape, dropping junk. */
function cleanCourses(raw: unknown): TripCourse[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c): TripCourse | null => {
      const name = typeof c?.name === "string" ? c.name.trim().slice(0, 120) : "";
      if (!name) return null;
      const slug = typeof c?.slug === "string" && c.slug ? c.slug.slice(0, 100) : null;
      return { slug, name };
    })
    .filter((c): c is TripCourse => c !== null)
    .slice(0, 40);
}

/** Coerce a client-sent attendees array. userId is trusted only if it's a UUID. */
function cleanAttendees(raw: unknown): TripAttendee[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((a): TripAttendee | null => {
      const name = typeof a?.name === "string" ? a.name.trim().slice(0, 120) : "";
      if (!name) return null;
      const userId = typeof a?.userId === "string" && UUID_RE.test(a.userId) ? a.userId : null;
      // Dedupe: one row per member (by id) and one per distinct guest name.
      const key = userId ? `u:${userId}` : `n:${name.toLowerCase()}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { userId, name };
    })
    .filter((a): a is TripAttendee => a !== null)
    .slice(0, 60);
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

/**
 * Edit a trip's recap fields (currently the courses played). Owner/admin only.
 * Auth mirrors POST: 404 for a non-manager so a private club stays hidden.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string; tripId: string }> }) {
  try {
    const { slug, tripId } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    if (!UUID_RE.test(tripId)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const viewer = await getClubViewer(club.id, session.user.id, pool);
    if (!canManage(viewer)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const patch: {
      courses?: TripCourse[];
      attendees?: TripAttendee[];
      visibility?: TripVisibility;
      destinationSlug?: string | null;
    } = {};
    if ("courses" in (body ?? {})) patch.courses = cleanCourses(body.courses);
    if ("attendees" in (body ?? {})) patch.attendees = cleanAttendees(body.attendees);
    if ("visibility" in (body ?? {})) {
      patch.visibility = body.visibility === "attendees" ? "attendees" : "club";
    }
    if ("destinationSlug" in (body ?? {})) {
      // A GolfTrips slug (lowercase, hyphenated) or null to unlink. Anything else
      // is treated as "unlink" rather than stored as junk.
      const s = body.destinationSlug;
      patch.destinationSlug = typeof s === "string" && /^[a-z0-9-]{1,100}$/.test(s) ? s : null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const result = await updateClubTripRecap(club.id, tripId, patch, pool);
    if (!result.ok) {
      return NextResponse.json({ error: "That trip isn't in this club." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...patch });
  } catch (err) {
    console.error("[clubs/trips/:id] PATCH error:", err);
    return NextResponse.json({ error: "Could not update the trip." }, { status: 500 });
  }
}
