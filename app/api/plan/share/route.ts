import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { SITE_URL } from "@/lib/seo";

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
    const clean = {
      destinations: destinations.slice(0, 50).map((d) => ({
        slug: String(d.slug),
        name: String(d.name),
        overallRating: typeof d.overallRating === "number" ? d.overallRating : null,
        costTier: typeof d.costTier === "number" ? d.costTier : null,
      })),
      golfers: Number(state?.golfers) || null,
      nights: Number(state?.nights) || null,
      when: state?.when ?? null,
      sharedBy: session.user.name ?? null,
    };

    const pool = getPgPool();
    const { rows } = await pool.query(
      `INSERT INTO shared_trips (user_id, state) VALUES ($1, $2::jsonb) RETURNING id`,
      [session.user.id, JSON.stringify(clean)]
    );
    const id = rows[0].id as string;

    return NextResponse.json({ id, url: `${SITE_URL}/plan/shared/${id}` }, { status: 201 });
  } catch (err) {
    console.error("[plan/share] create error:", err);
    return NextResponse.json({ error: "Could not save your trip. Try again." }, { status: 500 });
  }
}
