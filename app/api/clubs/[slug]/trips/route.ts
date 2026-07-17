import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { SITE_URL } from "@/lib/seo";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import { createClubTrip } from "@/lib/clubTrips";
import { isVoteType, defaultVoteConfig, type VoteConfig } from "@/lib/planVote";
import { createBracket } from "@/lib/planBracket";

type Destination = { slug: string; name: string; overallRating?: number | null; costTier?: number | null };

/**
 * Propose a club trip: create the trip, its poll, and seat the whole active
 * roster. Owner/admin only.
 *
 * The club analog of POST /api/plan/share, and deliberately not a wrapper around
 * it: that route seats only the creator and leaves the rest of the roster to be
 * filled in by the email-send handler. A club already knows its members, so
 * nothing is emailed and no seat depends on Resend succeeding.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in to propose a trip." }, { status: 401 });
    }

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    // 404 rather than 403 for a non-manager, matching the page and the invite
    // route: a 403 would confirm a private club exists.
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const viewer = await getClubViewer(club.id, session.user.id, pool);
    if (!canManage(viewer)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const state = body?.state;
    const destinations: Destination[] = Array.isArray(state?.destinations) ? state.destinations : [];
    if (destinations.length < 2) {
      return NextResponse.json(
        { error: "Add at least two destinations for the club to choose between." },
        { status: 400 }
      );
    }

    // Store only the fields we render — small and trusted-shaped. Same clamp as
    // /api/plan/share.
    const cleanDests = destinations.slice(0, 50).map((d) => ({
      slug: String(d.slug),
      name: String(d.name),
      overallRating: typeof d.overallRating === "number" ? d.overallRating : null,
      costTier: typeof d.costTier === "number" ? d.costTier : null,
    }));

    // A club trip is always a vote — that's the entire point of proposing it to a
    // group. Defaults to approval if the client sends nothing usable.
    const voteType = isVoteType(body?.vote?.type) ? body.vote.type : "approval";
    const vote: VoteConfig = defaultVoteConfig(voteType);
    if (vote.type === "bracket") {
      vote.bracket = createBracket(cleanDests.map((d) => d.slug));
    }

    const title = body?.title ? String(body.title).trim().slice(0, 120) || null : null;

    const result = await createClubTrip(
      {
        clubId: club.id,
        createdBy: session.user.id,
        createdByName: session.user.name ?? null,
        title,
        destinations: cleanDests,
        vote,
        golfers: Number(state?.golfers) || null,
        nights: Number(state?.nights) || null,
        when: state?.when ?? null,
      },
      pool
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        tripId: result.tripId,
        id: result.pollId,
        url: `${SITE_URL}/plan/shared/${result.pollId}`,
        clubUrl: `${SITE_URL}/clubs/${club.slug}`,
        vote,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[clubs/trips] create error:", err);
    return NextResponse.json({ error: "Could not propose the trip. Try again." }, { status: 500 });
  }
}
