import Link from "next/link";
import { getPublishedJourneys } from "../../lib/airtable";
import { formatDuration, formatCostTier } from "../../lib/formatters";
import styles from "../../styles/journey.module.css";
import tripsStyles from "../../styles/trips.module.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Golf Journey Rankings | GolfTripIndex",
  description: "A ranking of the best extended golf journeys in America.",
};

export default async function JourneysPage() {
  const journeys = await getPublishedJourneys();

  return (
    <main className={tripsStyles.page}>
      <section className={tripsStyles.banner}>
        <div className={tripsStyles.bannerMedia} aria-hidden="true" />
        <div className={tripsStyles.bannerPanel}>
          <div className={tripsStyles.bannerTitle}>2026 Golf Journeys</div>
          <div className={tripsStyles.bannerSub}>
            Extended golf trips of 6 or more days, ranked for those who want to go all in on the experience.
          </div>
          <div className={tripsStyles.segment}>
            <Link href="/trips" className={tripsStyles.segmentItem}>
              Trips (2–5 days)
            </Link>
            <span className={`${tripsStyles.segmentItem} ${tripsStyles.active}`}>
              Journeys (6+ days)
            </span>
          </div>
        </div>
      </section>

      <section className={tripsStyles.listWrap}>
        <div className={tripsStyles.listInner}>
          {journeys.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 15, padding: "40px 0" }}>
              Journeys coming soon.
            </p>
          ) : (
            <div className={styles.journeyListGrid}>
              {journeys.map((j) => {
                const href = `/journeys/${j.slug}`;
                return (
                  <article
                    key={j.id}
                    className={`${styles.journeyListCard} whiteRoundedBox`}
                  >
                    <div className={styles.journeyListImageWrap}>
                      <Link href={href} className={styles.journeyListImageLink} aria-label={j.name}>
                        <img
                          className={styles.journeyListImg}
                          src={`/images/journeys/${j.slug}.jpg`}
                          alt=""
                          loading="lazy"
                        />
                      </Link>
                    </div>
                    <div className={styles.journeyListBody}>
                      <div className={styles.journeyListName}>
                        <Link href={href} className={styles.journeyListNameLink}>
                          {j.name}
                        </Link>
                      </div>
                      {j.description && (
                        <div className={styles.journeyListTeaser}>{j.description}</div>
                      )}
                      <div className={styles.journeyListPills}>
                        <span className={styles.journeyListPill}>
                          {formatDuration(j.durationMinDays, j.durationMaxDays)}
                        </span>
                        {j.costTier && (
                          <span className={styles.journeyListPill}>
                            {formatCostTier(j.costTier)}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
