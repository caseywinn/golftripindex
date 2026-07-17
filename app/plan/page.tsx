import type { Metadata } from "next";
import ShortlistClient from "./ShortlistClient";
import { getPublishedTrips } from "@/lib/airtable";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";

export const metadata: Metadata = {
  title: "Plan a Golf Trip | GolfTripIndex",
  description: "Build your group trip shortlist: date windows, destination options, and a Caddie to help you plan.",
  robots: { index: false },
};

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const [raw, session, sp] = await Promise.all([getPublishedTrips(), auth(), searchParams]);

  // ?club=<slug> puts the page in "propose to a club" mode, arriving from the
  // club page's Propose a trip button. Resolved and authorized here rather than
  // trusted from the query string — anyone can type it, so a non-admin (or a
  // stranger guessing a slug) silently gets the ordinary /plan page back, which
  // also means the param can't be used to probe whether a club exists.
  let club: { slug: string; name: string } | null = null;
  if (sp?.club && session?.user?.id) {
    const pool = getPgPool();
    const c = await getClubBySlug(sp.club, pool);
    if (c && canManage(await getClubViewer(c.id, session.user.id, pool))) {
      club = { slug: c.slug, name: c.name };
    }
  }

  let wishlistSlugs: string[] = [];
  if (session?.user?.id) {
    const pool = getPgPool();
    const { rows } = await pool.query(
      `SELECT item_id FROM user_items
       WHERE user_id = $1 AND item_type = 'trip' AND status = 'wishlist'
       ORDER BY created_at DESC`,
      [session.user.id]
    );
    wishlistSlugs = rows.map((r: { item_id: string }) => r.item_id);
  }

  const trips = raw.map((t) => ({
    slug: t.slug,
    name: t.name,
    overallRating: t.overallRating,
    durationMinDays: t.durationMinDays,
    durationMaxDays: t.durationMaxDays,
    costTier: t.costTier,
    region: t.region,
    seasons: t.seasons,
    closedMonths: t.closedMonths,
    badMonths: t.badMonths,
    top100Count: t.top100Count,
    vibe: t.vibe,
    leadTime: t.leadTime,
    driving: t.driving,
    currentRanking: t.currentRanking ?? null,
  }));

  return (
    <ShortlistClient
      trips={trips}
      wishlistSlugs={wishlistSlugs}
      isLoggedIn={!!session?.user?.id}
      club={club}
    />
  );
}
