import Link from "next/link";
import styles from "../../styles/trips.module.css";
import { getPublishedTrips } from "../../lib/airtable";

type SearchParams = Promise<{ days?: string }>;

export default async function TripsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const days = sp.days ?? "2-5"; // default
  const trips = await getPublishedTrips(); // no filtering yet per your ask

  return (
    <main className={styles.page}>
      {/* Banner */}
      <section className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true" />

        <div className={styles.bannerInner}>
          <div className={styles.bannerCard}>
            <div className={styles.bannerTitle}>2026 Golf Trip Rankings</div>
            <div className={styles.bannerSub}>PUBLISHED JAN 20, 2026</div>
          </div>

          <div className={styles.segment}>
            <Link
              href="/trips?days=2-5"
              className={`${styles.segmentItem} ${days === "2-5" ? styles.active : ""}`}
            >
              2–5 Days
            </Link>
            <Link
              href="/trips?days=6-10"
              className={`${styles.segmentItem} ${days === "6-10" ? styles.active : ""}`}
            >
              6–10 Days
            </Link>
          </div>
        </div>
      </section>

      {/* Content area (placeholder list for now) */}
      <section className={styles.content}>
        <div className={styles.grid}>
          {trips.map((t) => (
            <Link key={t.id} href={`/trips/${t.slug}`} className={styles.tripCard}>
              <div
                className={styles.tripThumb}
                style={{
                  backgroundImage: t.thumbnailImageUrl ? `url(${t.thumbnailImageUrl})` : undefined,
                }}
                aria-hidden="true"
              />
              <div className={styles.tripMeta}>
                <div className={styles.tripName}>{t.name}</div>
                {t.secondaryName && <div className={styles.tripSecondary}>{t.secondaryName}</div>}
                <div className={styles.tripStats}>
                  <span>Overall {t.overallRating?.toFixed?.(1) ?? t.overallRating ?? "—"}</span>
                  <span className={styles.dot}>•</span>
                  <span>Cost {"$".repeat(Math.max(0, Math.min(5, Number(t.costDollarSigns ?? 0)))) || "—"}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
