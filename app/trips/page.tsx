import { Suspense } from "react";
import Link from "next/link";
import styles from "../../styles/trips.module.css";
import { getPublishedTripsWithFirstCourse } from "../../lib/airtable";
import type { Metadata } from "next";
import TripsWithFilters from "../../components/TripsWithFilters";
import { SITE_URL } from "../../lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "Best Golf Trips USA 2026: Complete Rankings and Destination Guide",
  description: "Independent rankings of America's best golf trips, rated on course quality, lodging, food, cost, and vibe. Destination guides for every region and budget.",
  alternates: { canonical: `${SITE_URL}/trips` },
};

export default async function TripsPage() {
  const rawTrips = await getPublishedTripsWithFirstCourse();

  // Strip large text fields that are only needed on individual trip pages,
  // not the list view — keeps the server→client payload under 150KB.
  const trips = rawTrips.map(({ id, slug, name, secondaryName, currentRanking, previousRanking,
    durationMinDays, durationMaxDays, driving, stayType, leadTime, costTier, overview,
    golfRating, lodgingRating, foodRating, vibeRating, overallRating,
    region, state, seasons, top100Count, firstCourse }) => ({
    id, slug, name, secondaryName, currentRanking, previousRanking,
    durationMinDays, durationMaxDays, driving, stayType, leadTime, costTier, overview,
    golfRating, lodgingRating, foodRating, vibeRating, overallRating,
    region: region ?? undefined,
    state: state ?? undefined,
    seasons: seasons ?? undefined,
    top100Count,
    firstCourse: firstCourse ? { slug: firstCourse.slug } : undefined,
  }));

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "2026 Golf Trip Rankings",
    description: "Independent rankings of America's best golf trips, rated on courses, lodging, food, cost, and vibe.",
    url: `${SITE_URL}/trips`,
    itemListElement: trips
      .filter((t) => t.currentRanking != null)
      .sort((a, b) => (a.currentRanking ?? 999) - (b.currentRanking ?? 999))
      .slice(0, 50)
      .map((t, i) => ({
        "@type": "ListItem",
        position: t.currentRanking ?? i + 1,
        name: t.name,
        url: `${SITE_URL}/trips/${t.slug}`,
      })),
  };

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
      <JsonLd data={itemListSchema} />
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

      <section className={styles.editorial}>
        <div className={styles.editorialInner}>
          <h2 className={styles.editorialHeading}>About These Rankings</h2>
          <div className={styles.editorialBody}>
            <p>
              GTI ranks golf trips, not golf courses. A destination earns its position by
              delivering a complete experience: the quality of the golf, the lodging situation,
              the food, the overall vibe, and whether the cost makes sense relative to what you
              get. A course lineup full of Top 100 holes still produces a bad trip if the lodge
              is a Marriott Courtyard and dinner is a gas station.
            </p>
            <p>
              Each destination is scored across five categories. Golf quality carries the most
              weight, but the rating reflects the full trip. Bandon Dunes sits at the top because
              the courses are exceptional AND because the on-property experience matches them.
              RTJ Trail scores well on value because the course quality dramatically exceeds what
              the price suggests. Destinations that punch below their price point fall accordingly.
            </p>
            <p>
              The rankings are updated annually. A destination that slips in maintenance, changes
              its booking model, or gets significantly more expensive relative to alternatives
              will move. A new course that opens and changes a destination&apos;s calculus gets
              reflected in the next update cycle.
            </p>
            <h3 className={styles.editorialSubheading}>How to Use the Rankings</h3>
            <p>
              Start with the full ranked list, then use the filters. Sorting by region narrows
              to destinations within a reasonable drive or short flight. The budget filter removes
              trips that are genuinely out of range for your group. Duration filters out week-long
              resort trips when you only have a weekend.
            </p>
            <p>
              The cost tier on each trip page reflects the realistic all-in estimate per person for
              three to four days, excluding flights. It includes lodging, green fees, and a
              reasonable food and incidentals budget. It does not include airfare, because that
              variable is too dependent on your origin city to be meaningful in a ranking.
            </p>
            <h3 className={styles.editorialSubheading}>Regional Overview</h3>
            <p>
              <strong>Southeast:</strong> Florida and the Carolinas anchor the region.{" "}
              <Link href="/articles/best-golf-trips-florida">Florida</Link> offers year-round play
              with Streamsong and Cabot Citrus Farms as the flagship destinations.{" "}
              <Link href="/articles/best-golf-trips-north-carolina">North Carolina&apos;s</Link>{" "}
              Sandhills give you Pinehurst No. 2 and 40 surrounding courses within 20 miles.
            </p>
            <p>
              <strong>Midwest:</strong>{" "}
              <Link href="/articles/best-golf-trips-michigan">Michigan</Link> is the most
              underrated public golf state in the country. Arcadia Bluffs belongs on any serious
              golfer&apos;s bucket list.{" "}
              <Link href="/articles/best-golf-trips-wisconsin">Wisconsin</Link> offers two
              completely different world-class experiences: Sand Valley&apos;s minimalist
              architecture and Kohler&apos;s full resort luxury.
            </p>
            <p>
              <strong>Pacific Northwest:</strong>{" "}
              <Link href="/articles/best-golf-trips-oregon">Oregon&apos;s</Link> Bandon Dunes is
              the benchmark for American links golf. Five courses, walking only, no distractions.
              Plan 12 to 18 months out for summer travel.
            </p>
            <p>
              For step-by-step booking logistics that apply to any destination on this list,
              see the <Link href="/articles/how-to-plan-a-golf-trip">golf trip planning guide</Link>.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.guidesStrip}>
        <div className={styles.guidesInner}>
          <div className={styles.guidesGroup}>
            <span className={styles.guidesLabel}>Plan your trip</span>
            <div className={styles.guidesLinks}>
              <Link href="/articles/how-to-plan-a-golf-trip">How to Plan a Golf Trip</Link>
              <Link href="/articles/golf-trip-packing-list">Packing List</Link>
              <Link href="/articles/bachelor-party-golf-trips">Bachelor Party Trips</Link>
              <Link href="/articles/ship-the-clubs-or-fly">Ship the Clubs or Fly?</Link>
              <Link href="/articles/spouse-friendly-trip">Spouse-Friendly Trips</Link>
              <Link href="/articles/best-weekend-golf-trips">Best Weekend Trips</Link>
            </div>
          </div>
          <div className={styles.guidesDivider} />
          <div className={styles.guidesGroup}>
            <span className={styles.guidesLabel}>By destination</span>
            <div className={styles.guidesLinks}>
              <Link href="/articles/best-golf-trips-florida">Florida</Link>
              <Link href="/articles/best-golf-trips-north-carolina">North Carolina</Link>
              <Link href="/articles/best-golf-trips-michigan">Michigan</Link>
              <Link href="/articles/best-golf-trips-wisconsin">Wisconsin</Link>
              <Link href="/articles/best-golf-trips-oregon">Oregon</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
