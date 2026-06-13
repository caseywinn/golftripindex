import type { Metadata } from "next";
import Plan2Client from "./Plan2Client";
import { getPublishedTrips } from "@/lib/airtable";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";

export const metadata: Metadata = {
  title: "Plan a Golf Trip | GolfTripIndex",
  description: "Filter destinations, build your group trip shortlist, and ask the GTI Caddie for help.",
  robots: { index: false },
};

export default async function Plan2Page() {
  const [raw, session] = await Promise.all([getPublishedTrips(), auth()]);

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

  return <Plan2Client trips={trips} wishlistSlugs={wishlistSlugs} />;
}
