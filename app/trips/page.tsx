import Link from "next/link";
import styles from "../../styles/trips.module.css";
import { getPublishedTripsWithFirstCourse } from "../../lib/airtable";
import type { Metadata } from "next";
import TripsListClient from "../../components/TripsListClient";

export const metadata: Metadata = {
  title: "Golf Trip Rankings | GolfTripIndex",
  description: "An overall ranking of the best golf trips in America.",
};

type SearchParams = Promise<{ days?: string }>;

export default async function TripsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const days = sp.days ?? "2-5";

  const trips = await getPublishedTripsWithFirstCourse();

  const sorted = [...trips].sort(
    (a, b) => (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999)
  );

  return (
    <main className={styles.page}>
      {/* Banner */}
      <section className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true" />

        <div className={styles.bannerInner}>
          <div className={`${styles.bannerCard} blueBannerCard`}>
            <div className={styles.bannerTitle}>2026 Golf Trip Rankings</div>
            <div className={styles.bannerSub}>PUBLISHED JAN 20, 2026</div>
          </div>

          <div className={styles.segment}>
            <Link
              href="/trips?days=2-5"
              className={`${styles.segmentItem} ${
                days === "2-5" ? styles.active : ""
              }`}
            >
              2–5 Days
            </Link>
            <Link
              href="/trips?days=6-10"
              className={`${styles.segmentItem} ${
                days === "6-10" ? styles.active : ""
              }`}
            >
              6–10 Days (Coming Soon)
            </Link>
          </div>
        </div>
      </section>

      {/* Trip tiles */}
      <section className={styles.listWrap}>
        <div className={styles.listInner}>
          <TripsListClient trips={sorted} pageSize={10} />
        </div>
      </section>
    </main>
  );
}