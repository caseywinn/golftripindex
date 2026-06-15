import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { SITE_URL } from "@/lib/seo";
import { isVoteType, defaultVoteConfig, type VoteConfig } from "@/lib/planVote";
import { createBracket } from "@/lib/planBracket";

type Destination = { slug: string; name: string; overallRating?: number | null; costTier?: number | null };

// Save the current /plan working state as a shareable trip. Auth required.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in to share a trip." }, { status: 401 });
    }

    const body = await req.json();
    const state = body?.state;
    const destinations: Destination[] = Array.isArray(state?.destinations) ? state.destinations : [];
    if (destinations.length === 0) {
      return NextResponse.json({ error: "Add at least one destination first." }, { status: 400 });
    }

    // Store only the fields we render — keep it small and trusted-shaped.
    const cleanDests = destinations.slice(0, 50).map((d) => ({
      slug: String(d.slug),
      name: String(d.name),
      overallRating: typeof d.overallRating === "number" ? d.overallRating : null,
      costTier: typeof d.costTier === "number" ? d.costTier : null,
    }));

    // Optional group vote. Only meaningful with 2+ destinations to choose between.
    const voteIn = body?.vote;
    let vote: VoteConfig | null = null;
    if (voteIn && isVoteType(voteIn.type)) {
      if (cleanDests.length < 2) {
        return NextResponse.json({ error: "Add at least two destinations to start a vote." }, { status: 400 });
      }
      vote = defaultVoteConfig(voteIn.type);
      // A bracket needs its seeded structure built up front so round 1 is ready.
      if (vote.type === "bracket") {
        vote.bracket = createBracket(cleanDests.map((d) => d.slug));
      }
    }

    const clean = {
      destinations: cleanDests,
      golfers: Number(state?.golfers) || null,
      nights: Number(state?.nights) || null,
      when: state?.when ?? null,
      sharedBy: session.user.name ?? null,
      vote,
    };

    const pool = getPgPool();
    const { rows } = await pool.query(
      `INSERT INTO shared_trips (user_id, state) VALUES ($1, $2::jsonb) RETURNING id`,
      [session.user.id, JSON.stringify(clean)]
    );
    const id = rows[0].id as string;

    // Seed the captain onto the roster so they're counted as a voter (and so the
    // "everyone voted" denominator is never zero). Invitees are added when emailed.
    if (vote) {
      const captainEmail = (session.user.email ?? `captain:${session.user.id}`).toLowerCase();
      await pool.query(
        `INSERT INTO trip_poll_voters (shared_trip_id, email, user_id, is_captain)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (shared_trip_id, email) DO NOTHING`,
        [id, captainEmail, session.user.id]
      );
    }

    return NextResponse.json({ id, url: `${SITE_URL}/plan/shared/${id}`, vote }, { status: 201 });
  } catch (err) {
    console.error("[plan/share] create error:", err);
    return NextResponse.json({ error: "Could not save your trip. Try again." }, { status: 500 });
  }
}
