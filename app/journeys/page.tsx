import Link from "next/link";
import { getPublishedJourneys } from "../../lib/airtable";
import { formatDuration, formatCostTier } from "../../lib/formatters";
import styles from "../../styles/journey.module.css";
import tripsStyles from "../../styles/trips.module.css";
import SaveButton from "@/components/SaveButton";
import ShareButton from "@/components/ShareButton";
import type { Metadata } from "next";
import { SITE_URL } from "../../lib/seo";

export const metadata: Metadata = {
  title: "Best Golf Road Trips in America",
  description:
    "Multi-stop golf road trips across America — the RTJ Trail, the California coast, Seattle to Bandon — each rated on courses, lodging, food, and cost.",
  alternates: { canonical: `${SITE_URL}/journeys` },
};

export default async function JourneysPage() {
  const journeys = await getPublishedJourneys();

  return (
    <main className={tripsStyles.page}>
      <section className={tripsStyles.banner}>
        <div className={tripsStyles.bannerMedia} aria-hidden="true" />
        <div className={tripsStyles.bannerPanel}>
          <h1 className={tripsStyles.bannerTitle}>Golf Journeys</h1>
          <div className={tripsStyles.bannerSub}>
            A collection of America's best extended golf trips, rated on the full experience: the courses, the lodging, the food, and how it all comes together when you have a week or more to play.
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
                      <ShareButton itemType="journey" itemId={j.slug} itemName={j.name} variant="dark" corner small />
                    </div>
                    <div className={styles.journeyListBody}>
                      <div className={styles.journeyListName}>
                        <Link href={href} className={styles.journeyListNameLink}>
                          {j.name}
                        </Link>
                      </div>
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
                      {j.description && (
                        <div className={styles.journeyListTeaser}>{j.description}</div>
                      )}
                      <div className={styles.journeyListCardFooter}>
                        <SaveButton itemType="journey" itemId={j.slug} />
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
