import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedJourneys } from "@/lib/airtable";
import { formatDuration, formatCostTier } from "@/lib/formatters";
import styles from "@/styles/journey.module.css";

export const metadata: Metadata = {
  title: "Golf Journeys | GolfTripIndex",
  description: "Multi-day golf journeys across America — curated stop-by-stop itineraries with courses, hotels, and restaurants.",
};

export default async function JourneysPage() {
  const journeys = await getPublishedJourneys();

  return (
    <main className={styles.listPage}>
      <div className={styles.listHero}>
        <h1 className={styles.listTitle}>Golf Journeys</h1>
        <p className={styles.listSub}>
          Multi-day, point-to-point golf trips with curated stops, must-play courses, hotels, and restaurants — planned for groups who want more than a weekend round.
        </p>
      </div>

      <div className={styles.listBody}>
        {journeys.length === 0 ? (
          <p className={styles.empty}>Journeys coming soon.</p>
        ) : (
          journeys.map((j) => (
            <Link
              key={j.id}
              href={`/journeys/${j.slug}`}
              className={styles.journeyCard}
            >
              <div
                className={styles.journeyCardImage}
                style={{
                  backgroundImage: `url("/images/journeys/${j.slug}.jpg")`,
                }}
                aria-hidden="true"
              />

              <div className={styles.journeyCardBody}>
                <div className={styles.journeyCardName}>{j.name}</div>

                {j.description && (
                  <div className={styles.journeyCardDesc}>{j.description}</div>
                )}

                <div className={styles.journeyCardMeta}>
                  <span>{formatDuration(j.durationMinDays, j.durationMaxDays)}</span>
                  {j.costTier && <span>{formatCostTier(j.costTier)}</span>}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
