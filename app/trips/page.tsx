import Link from "next/link";
import styles from "../../styles/trips.module.css";
import journeyStyles from "../../styles/journey.module.css";
import { getPublishedTripsWithFirstCourse, getPublishedJourneys } from "../../lib/airtable";
import { formatDuration, formatCostTier } from "../../lib/formatters";
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

  let content: React.ReactNode;

  if (days === "6-10") {
    const journeys = await getPublishedJourneys();
    content = journeys.length === 0 ? (
      <p style={{ color: "#6b7280", fontSize: 15, padding: "40px 0" }}>
        Journeys coming soon.
      </p>
    ) : (
      <div className={journeyStyles.journeyListWrap}>
        {journeys.map((j) => (
          <Link
            key={j.id}
            href={`/journeys/${j.slug}`}
            className={journeyStyles.journeyCard}
          >
            <div
              className={journeyStyles.journeyCardImage}
              style={{ backgroundImage: `url("/images/journeys/${j.slug}.jpg")` }}
              aria-hidden="true"
            />
            <div className={journeyStyles.journeyCardBody}>
              <div className={journeyStyles.journeyCardName}>{j.name}</div>
              {j.description && (
                <div className={journeyStyles.journeyCardDesc}>{j.description}</div>
              )}
              <div className={journeyStyles.journeyCardMeta}>
                <span>{formatDuration(j.durationMinDays, j.durationMaxDays)}</span>
                {j.costTier && <span>{formatCostTier(j.costTier)}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    );
  } else {
    const trips = await getPublishedTripsWithFirstCourse();
    const sorted = [...trips].sort(
      (a, b) => (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999)
    );
    const filtered = sorted.filter((t) => (t.durationMinDays ?? 0) <= 5);
    content = filtered.length > 0 ? (
      <TripsListClient trips={filtered} pageSize={10} />
    ) : (
      <p style={{ color: "#6b7280", fontSize: 15, padding: "40px 0" }}>
        No 2–5 day trips published yet. Check back soon.
      </p>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true" />
        <div className={styles.bannerPanel}>
          <div className={styles.bannerTitle}>2026 Golf Trip Rankings</div>
          <div className={styles.bannerSub}>
            A ranking of the best golf trips in America, offering an informed, independent view that evaluates the full experience—from the quality of the golf to how well a trip actually comes together.
          </div>
          <div className={styles.segment}>
            <Link
              href="/trips?days=2-5"
              className={`${styles.segmentItem} ${days === "2-5" ? styles.active : ""}`}
            >
              2-5 Days
            </Link>
            <Link
              href="/trips?days=6-10"
              className={`${styles.segmentItem} ${days === "6-10" ? styles.active : ""}`}
            >
              6-10 Days
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.listWrap}>
        <div className={styles.listInner}>
          {content}
        </div>
      </section>
    </main>
  );
}
