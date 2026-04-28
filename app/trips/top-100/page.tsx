import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedTripsWithFirstCourse } from "@/lib/airtable";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import TripFilters from "@/components/TripFilters";
import TripsListClient from "@/components/TripsListClient";
import styles from "@/styles/trips.module.css";

export const revalidate = 86400;

const TITLE = "Golf Trips with Top 100 Courses";
const DESCRIPTION =
  "Golf trips that include at least one Top 100 ranked course in America, ranked by overall experience, course quality, and value.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/trips/top-100` },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/trips/top-100`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

export default async function Top100TripsPage() {
  const allTrips = await getPublishedTripsWithFirstCourse();
  const filtered = allTrips
    .filter((t) => t.hasTop100Course === true)
    .sort((a, b) => (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999));

  return (
    <main className={styles.page}>
      <section className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true" />
        <div className={styles.bannerPanel}>
          <div className={styles.bannerTitle}>Golf Trips — Top 100 Courses</div>
          <div className={styles.bannerSub}>{DESCRIPTION}</div>
        </div>
      </section>

      <section className={styles.listWrap}>
        <div className={styles.listInner}>
          <TripFilters activeType="top-100" />

          {filtered.length > 0 ? (
            <TripsListClient trips={filtered} pageSize={20} />
          ) : (
            <div style={{ padding: "40px 0", color: "#6b7280", fontSize: 15 }}>
              <p>No trips tagged with Top 100 courses yet.</p>
              <p style={{ marginTop: 8 }}>
                <Link href="/trips" style={{ color: "#111", fontWeight: 600 }}>
                  View all trips →
                </Link>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
