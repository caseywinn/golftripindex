import { Suspense } from "react";
import Link from "next/link";
import styles from "../../styles/trips.module.css";
import { getPublishedTripsWithFirstCourse } from "../../lib/airtable";
import type { Metadata } from "next";
import TripsWithFilters from "../../components/TripsWithFilters";
import { SITE_URL } from "../../lib/seo";

export const metadata: Metadata = {
  title: "Golf Trip Rankings",
  description: "Independent rankings of America's best golf trips — rated on courses, lodging, food, cost, and vibe. Updated for 2026.",
  alternates: { canonical: `${SITE_URL}/trips` },
};

export default async function TripsPage() {
  const trips = await getPublishedTripsWithFirstCourse();

  const content =
    trips.length > 0 ? (
      <Suspense fallback={null}>
        <TripsWithFilters trips={trips} pageSize={20} />
      </Suspense>
    ) : (
      <p style={{ color: "#6b7280", fontSize: 15, padding: "40px 0" }}>
        No trips published yet. Check back soon.
      </p>
    );

  return (
    <main className={styles.page}>
      <section className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true" />
        <div className={styles.bannerPanel}>
          <h1 className={styles.bannerTitle}>2026 Golf Trip Rankings</h1>
          <div className={styles.bannerSub}>
            A ranking of the best golf trips in America, offering an informed, independent view that evaluates the full experience, from the quality of the golf to how well a trip actually comes together.
          </div>
          <div className={styles.segment}>
            <Link
              href="/trips"
              className={`${styles.segmentItem} ${styles.active}`}
            >
              Trips (2–5 days)
            </Link>
            <Link href="/journeys" className={styles.segmentItem}>
              Journeys (6+ days)
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.listWrap}>
        <div className={styles.listInner}>{content}</div>
      </section>
    </main>
  );
}
