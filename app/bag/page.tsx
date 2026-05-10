import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getPublishedTrips, getPublishedJourneys } from "@/lib/airtable";
import BagCarousels, { type BagItem } from "@/components/BagCarousels";
import styles from "@/styles/bag.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Bag",
  robots: { index: false, follow: false },
};

export default async function BagPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/register?callbackUrl=/bag");
  }

  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT item_type, item_id, status
     FROM user_items
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [session.user.id]
  );

  const [trips, journeys] = await Promise.all([
    getPublishedTrips(),
    getPublishedJourneys(),
  ]);

  const tripMap = new Map(trips.map((t) => [t.slug, t]));
  const journeyMap = new Map(journeys.map((j) => [j.slug, j.name]));

  const items: BagItem[] = rows
    .filter((r) => r.item_type === "trip" || r.item_type === "journey")
    .map((row) => {
      const type = row.item_type as "trip" | "journey";
      const id: string = row.item_id;
      const trip = type === "trip" ? tripMap.get(id) : undefined;
      return {
        itemType: type,
        itemId: id,
        initialStatus: row.status as "wishlist" | "played",
        name: trip ? trip.name : (journeyMap.get(id) ?? id),
        href: type === "trip" ? `/trips/${id}` : `/journeys/${id}`,
        imageUrl: type === "trip" ? `/images/trips/${id}.jpg` : `/images/journeys/${id}.jpg`,
        ranking: trip?.currentRanking ?? undefined,
      };
    })
    .sort((a, b) => {
      // Journeys before trips
      if (a.itemType !== b.itemType) {
        return a.itemType === "journey" ? -1 : 1;
      }
      // Among trips: sort by ranking ascending (1 first), unranked last
      const ra = a.ranking ?? Infinity;
      const rb = b.ranking ?? Infinity;
      return ra - rb;
    });

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <h1>My Bag</h1>
          {session.user.name && (
            <p className={styles.sub}>{session.user.name}</p>
          )}
        </div>
      </header>
      <BagCarousels items={items} />
    </main>
  );
}
