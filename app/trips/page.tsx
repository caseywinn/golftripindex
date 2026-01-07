import Link from "next/link";
import styles from "../../styles/trips.module.css";
import TripCard from "../../components/TripCard";
import { getPublishedTrips } from "../../lib/airtable";

type SearchParams = Promise<{ days?: string }>;

export default async function TripsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const days = sp.days ?? "2-5";

  const trips = await getPublishedTrips();

  const sorted = [...trips].sort(
    (a, b) => (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999)
  );

  const top10 = sorted.slice(0, 10);

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

      {/* Trip tiles */}
      <section className={styles.listWrap}>
        <div className={styles.listInner}>
          <div className={styles.list}>
          {top10.map((t) => (
            <TripCard
              key={t.id}
              href={`/trips/${t.slug}`}
              currentRanking={t.currentRanking}
              previousRanking={t.previousRanking}
              name={t.name}
              secondaryName={t.secondaryName}
              durationMinDays={t.durationMinDays}
              durationMaxDays={t.durationMaxDays}
              drivingDistanceMiles={t.drivingDistanceMiles}
              stayType={t.stayType}
              leadTime={t.leadTime}
              costDollarSigns={t.costDollarSigns}
              overview={t.overview}
              thumbnailImageUrl={`/images/trips/${t.slug}.jpg`}
              golfRating={t.golfRating}
              lodgingRating={t.lodgingRating}
              foodRating={t.foodRating}
              vibeRating={t.vibeRating}
              overallRating={t.overallRating}
            />
          ))}
          </div>
        </div>
      </section>
    </main>
  );
}
