import type { Metadata } from "next";
import ShortlistClient from "./ShortlistClient";
import { getPublishedTrips } from "@/lib/airtable";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";

export const metadata: Metadata = {
  title: "Plan a Golf Trip | GolfTripIndex",
  description: "Build your group trip shortlist: date windows, destination options, and a Caddie to help you plan.",
  robots: { index: false },
};

export default async function PlanPage() {
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
    top100Count: t.top100Count,
    vibe: t.vibe,
    leadTime: t.leadTime,
    driving: t.driving,
  }));

  return <ShortlistClient trips={trips} wishlistSlugs={wishlistSlugs} />;
}
