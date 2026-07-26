import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getPublishedTrips, getPublishedJourneys } from "@/lib/airtable";
import { getUserProfile, userHasPassword } from "@/lib/users";
import { listClubsForUser } from "@/lib/clubs";
import BagCarousels, { type BagItem } from "@/components/BagCarousels";
import ProfileEditor from "@/components/ProfileEditor";
import MyClubs from "@/components/MyClubs";
import PasswordCard from "@/components/PasswordCard";
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

  const [trips, journeys, profile, clubs, hasPassword] = await Promise.all([
    getPublishedTrips(),
    getPublishedJourneys(),
    getUserProfile(session.user.id, pool),
    listClubsForUser(session.user.id, pool),
    // Drives which half of the password card renders — a Google-only account has
    // no current password to check, so it gets the by-email route instead.
    userHasPassword(session.user.id, pool),
  ]);

  // Trip options for the "favorite trip" picker — slug + name, ranked order.
  const tripOptions = [...trips]
    .sort((a, b) => (a.currentRanking ?? Infinity) - (b.currentRanking ?? Infinity))
    .map((t) => ({ slug: t.slug, name: t.name }));

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
      {profile && <ProfileEditor profile={profile} trips={tripOptions} />}
      <MyClubs clubs={clubs} />

      <BagCarousels items={items} />

      <PasswordCard hasPassword={hasPassword} />
    </main>
  );
}
