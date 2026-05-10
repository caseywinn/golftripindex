import { notFound } from "next/navigation";
import type { Metadata } from "next";
import styles from "../../../styles/tripDetails.module.css";
import { getPublishedTripBySlug, getPublishedTrips } from "../../../lib/airtable";
import CompareWidget from "../../../components/CompareWidget";
import {
  formatStayType,
  formatCostTier,
  formatDuration,
  formatDriving,
} from "../../../lib/formatters";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import EmailSignup from "@/components/EmailSignup";
import SaveButton from "@/components/SaveButton";
import ShareButton from "@/components/ShareButton";

export const revalidate = 86400;

export async function generateStaticParams() {
  const trips = await getPublishedTrips();
  return trips.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const trip = await getPublishedTripBySlug(slug);
  if (!trip) return {};

  const description =
    trip.seoDescription ||
    `GolfTripIndex rates the full ${trip.name} golf trip — courses, lodging, food, and cost. Find out if it's worth your group's next trip.`;
  const url = `${SITE_URL}/trips/${slug}`;

  return {
    title: `${trip.name} Golf Trip Review`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${trip.name} | ${SITE_NAME}`,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${trip.name} | ${SITE_NAME}`,
      description,
    },
  };
}

function statusLabel(status: string) {
  if (!status) return "";
  if (status === "must_play") return "MUST";
  if (status === "should_play") return "";
  if (status === "want_more") return "";
  return status.toUpperCase();
}

function safeNum(n: number | undefined) {
  if (typeof n !== "number") return 0;
  return n;
}

function safeInt(n: number | undefined) {
  if (typeof n !== "number") return 0;
  return Math.floor(n);
}

export default async function TripDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [trip, allTrips] = await Promise.all([
    getPublishedTripBySlug(slug),
    getPublishedTrips(),
  ]);
  if (!trip) return notFound();

  const otherTrips = allTrips
    .filter(t => t.slug !== slug)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => ({ slug: t.slug, name: t.name }));

  const heroUrl =
    `/images/trips/${trip.slug}.jpg` ||
    trip.heroImageUrl ||
    trip.thumbnailImageUrl;

  const courses = [...trip.courses].sort(
    (a, b) => a.tripCourseRank - b.tripCourseRank
  );

  const gridCoursesMustShould = courses.filter(
    (c) => c.status !== "want_more"
  );

  const gridCoursesWantMore = courses.filter(
    (c) => c.status === "want_more"
  );

  const mustPlay = courses
    .filter((c) => c.status === "must_play")
    .map((c) => c.course.name);
  const shouldPlay = courses
    .filter((c) => c.status === "should_play")
    .map((c) => c.course.name);
  const othersPlay = courses
    .filter((c) => !c.status)
    .map((c) => c.course.name);
  const wantMore = courses
    .filter((c) => c.status === "want_more")
    .map((c) => c.course.name);

  function joinNames(names: string[]) {
    return names.length ? names.join(", ") : "-";
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Trips", item: `${SITE_URL}/trips` },
      { "@type": "ListItem", position: 3, name: trip.name, item: `${SITE_URL}/trips/${trip.slug}` },
    ],
  };

  const tripSchema = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: `${trip.name} Golf Trip`,
    description: trip.overview ?? trip.fullDescription ?? undefined,
    url: `${SITE_URL}/trips/${trip.slug}`,
    ...(trip.overallRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: (trip.overallRating / 10).toFixed(1),
            bestRating: "10",
            worstRating: "1",
            ratingCount: "1",
          },
        }
      : {}),
  };

  return (
    <main className={styles.page}>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={tripSchema} />
      {/* HERO */}
      <section className={styles.banner}>
        <div
          className={styles.bannerMedia}
          style={{ backgroundImage: `url("${heroUrl}")` }}
        >
          <ShareButton itemType="trip" itemId={slug} itemName={trip.name} variant="dark" corner />
        </div>

        <div className={styles.bannerPanel}>
          <div className={styles.bannerInner}>
            {/* Title spans full width */}
            <div className={styles.bannerHeader}>
              <h1 className={styles.bannerTitle}>{trip.name}</h1>

              {/* short deck line like screenshot (use first line of overview if available) */}
              {trip.subheader ? (
                <p className={styles.bannerDeck}>
                  {trip.subheader.split("\n").filter(Boolean)[0]}
                </p>
              ) : null}

              <div className={styles.bannerSave}>
                <SaveButton itemType="trip" itemId={slug} variant="dark" />
              </div>
            </div>

            <div className={styles.bannerRule} aria-hidden="true" />

            {/* Two-column content area */}
            <div className={styles.bannerBody}>
              {/* LEFT: meta */}
              <div className={styles.bannerMeta}>
                <div className={styles.bannerMetaRow}>
                  <span className={styles.bannerMetaKey}>Duration:</span>
                  <span className={styles.bannerMetaVal}>
                    {formatDuration(trip.durationMinDays, trip.durationMaxDays)}
                  </span>
                </div>


                <div className={`${styles.bannerMetaRow} ${styles.metaTooltipWrapper}`}>
                  <span className={styles.bannerMetaKey}>Driving:</span>
                  <span className={styles.bannerMetaVal}>
                    {formatDriving(trip.driving)}
                    <i className={styles.metaTooltipIcon} aria-label="More info">i</i>
                  </span>
                  <span className={styles.metaTooltip}>
                    Driving between courses and lodging during the trip. Does not include travel to or from an airport.
                  </span>
                </div>

                <div className={styles.bannerMetaRow}>
                  <span className={styles.bannerMetaKey}>Stay Type:</span>
                  <span className={styles.bannerMetaVal}>
                    {formatStayType(trip.stayType)}
                  </span>
                </div>

                <div className={styles.bannerMetaRow}>
                  <span className={styles.bannerMetaKey}>Lead Time:</span>
                  <span className={styles.bannerMetaVal}>{trip.leadTime ?? "—"}</span>
                </div>

                <div className={styles.bannerMetaRow}>
                  <span className={styles.bannerMetaKey}>Cost:</span>
                  <span className={styles.bannerMetaVal}>
                    {formatCostTier(trip.costTier)}
                  </span>
                </div>
              </div>

              {/* RIGHT: scores */}
              <div className={styles.bannerScores}>
                <div className={styles.bannerScoreRow}>
                  <span className={styles.bannerScoreKey}>Golf:</span>
                  <span className={styles.bannerScoreVal}>{safeInt(trip.golfRating)}</span>
                </div>

                <div className={styles.bannerScoreRow}>
                  <span className={styles.bannerScoreKey}>Lodging:</span>
                  <span className={styles.bannerScoreVal}>{safeInt(trip.lodgingRating)}</span>
                </div>

                <div className={styles.bannerScoreRow}>
                  <span className={styles.bannerScoreKey}>Food:</span>
                  <span className={styles.bannerScoreVal}>{safeInt(trip.foodRating)}</span>
                </div>

                <div className={styles.bannerScoreRow}>
                  <span className={styles.bannerScoreKey}>Vibe:</span>
                  <span className={styles.bannerScoreVal}>{safeInt(trip.vibeRating)}</span>
                </div>

                <div className={styles.bannerScoreRowOverall}>
                  <span className={styles.bannerScoreKey}>Overall:</span>
                  <span className={styles.bannerOverallVal}>
                    {safeNum(trip.overallRating).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STICKY COMPARE BAR */}
      <CompareWidget tripName={trip.name} currentSlug={slug} trips={otherTrips} />

      {/* BODY */}
      <section className={styles.body}>
        {/* Course grid */}
        <div className={styles.carouselFrame}>
          <div className={styles.courseGrid}>
            {gridCoursesMustShould.map((c) => {
              const img = `/images/courses/${c.course.slug.toLowerCase()}.jpg`;

              return (
                <div
                  key={`${c.course.id}-${c.tripCourseRank}`}
                  className={`${styles.courseCard} whiteRoundedBox`}
                >
                  <div className={styles.courseImage} aria-hidden="true">
                    <div
                      className={styles.courseImageBg}
                      style={{ backgroundImage: `url("${img}")` }}
                    />
                    {c.course.consolidatedRanking ? (
                      <div className={styles.courseRankOverlay}>
                        #{c.course.consolidatedRanking}
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.courseHeader}>
                    <div className={styles.courseName}>{c.course.name}</div>
                    <div className={styles.courseStatus}>{statusLabel(c.status)}</div>
                  </div>

                  <div className={styles.courseRanks}>
                    <div className={styles.rankCell}>
                      <div className={styles.rankNum}>{c.course.golfDigestRanking ?? "NR"}</div>
                      <div className={styles.rankLabel}>Golf Digest</div>
                    </div>

                    <div className={styles.rankCell}>
                      <div className={styles.rankNum}>{c.course.golfDotComRanking ?? "NR"}</div>
                      <div className={styles.rankLabel}>Golf.com</div>
                    </div>

                    <div className={styles.rankCell}>
                      <div className={styles.rankNum}>{c.course.golfweekRanking ?? "NR"}</div>
                      <div className={styles.rankLabel}>Golfweek</div>
                    </div>

                    <div className={styles.rankCell}>
                      <div className={styles.rankNum}>{c.course.consolidatedRanking ?? "NR"}</div>
                      <div className={styles.rankLabel}>Overall</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.bodyInner}>
          {/* Main full-width content */}
          <div className={styles.mainCol}>
            {trip.fullDescription ? (
              <div className={styles.prose}>
                {trip.fullDescription
                  .split("\n")
                  .filter(Boolean)
                  .map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
              </div>
            ) : trip.overview ? (
              <div className={styles.prose}>
                <p>{trip.overview}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.carouselFrame}>
          <div className={styles.courseGrid}>
            {gridCoursesWantMore.map((c) => {
              const img = `/images/courses/${c.course.slug.toLowerCase()}.jpg`;

              return (
                <div
                  key={`${c.course.id}-${c.tripCourseRank}`}
                  className={`${styles.courseCard} whiteRoundedBox`}
                >
                  <div className={styles.courseImage} aria-hidden="true">
                    <div
                      className={styles.courseImageBg}
                      style={{ backgroundImage: `url("${img}")` }}
                    />
                    {c.course.consolidatedRanking ? (
                      <div className={styles.courseRankOverlay}>
                        #{c.course.consolidatedRanking}
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.courseHeader}>
                    <div className={styles.courseName}>{c.course.name}</div>
                    <div className={styles.courseStatus}>{statusLabel(c.status)}</div>
                  </div>

                  <div className={styles.courseRanks}>
                    <div className={styles.rankCell}>
                      <div className={styles.rankNum}>{c.course.golfDigestRanking ?? "NR"}</div>
                      <div className={styles.rankLabel}>Golf Digest</div>
                    </div>

                    <div className={styles.rankCell}>
                      <div className={styles.rankNum}>{c.course.golfDotComRanking ?? "NR"}</div>
                      <div className={styles.rankLabel}>Golf.com</div>
                    </div>

                    <div className={styles.rankCell}>
                      <div className={styles.rankNum}>{c.course.golfweekRanking ?? "NR"}</div>
                      <div className={styles.rankLabel}>Golfweek</div>
                    </div>

                    <div className={styles.rankCell}>
                      <div className={styles.rankNum}>{c.course.consolidatedRanking ?? "NR"}</div>
                      <div className={styles.rankLabel}>Overall</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.bodyInner}>
          {/* Main full-width content */}
          <div className={styles.mainCol}>
            {trip.wantMore ? (
              <div className={styles.prose}>
                {trip.wantMore
                  .split("\n")
                  .filter(Boolean)
                  .map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
              </div>
            ) : trip.overview ? (
              <div className={styles.prose}>
                <p>{trip.overview}</p>
              </div>
            ) : null}
          </div>

          <div className={`${styles.categorySection} whiteRoundedBox`}>
            <div className={styles.categoryTitle}>Courses included:</div>

            <div className={styles.categoryRows}>
              <div className={styles.categoryRow}>
                <div className={styles.categoryLabel}>Must Play:</div>
                <div className={styles.categoryValue}>{joinNames(mustPlay)}</div>
              </div>

              <div className={styles.categoryRow}>
                <div className={styles.categoryLabel}>Should Play:</div>
                <div className={styles.categoryValue}>
                  {joinNames(shouldPlay)}
                </div>
              </div>

              <div className={styles.categoryRow}>
                <div className={styles.categoryLabel}>Others:</div>
                <div className={styles.categoryValue}>
                  {joinNames(othersPlay)}
                </div>
              </div>

              <div className={styles.categoryRow}>
                <div className={styles.categoryLabel}>Want More:</div>
                <div className={styles.categoryValue}>{joinNames(wantMore)}</div>
              </div>
            </div>
          </div>

          {/* Two-up detail section below */}
          <div className={styles.detailGrid}>
            <div className={`${styles.sideCard} whiteRoundedBox`}>
              <div className={styles.sideTitle}>Sample Itinerary</div>

              {trip.sampleItinerary ? (
                <div className={styles.sideText}>
                  {trip.sampleItinerary
                    .split("\n")
                    .filter(Boolean)
                    .map((line, idx) => (
                      <div key={idx} className={styles.sideLine}>
                        {line}
                      </div>
                    ))}
                </div>
              ) : (
                <div className={styles.sideEmpty}>No itinerary provided.</div>
              )}

              {trip.sampleItineraryNotes ? (
                <div className={styles.sideNotes}>
                  <div className={styles.sideNotesLabel}>Notes:</div>
                  <div className={styles.sideNotesBody}>
                    {trip.sampleItineraryNotes
                      .split("\n")
                      .filter(Boolean)
                      .map((line, idx) => (
                        <div key={idx} className={styles.sideLine}>
                          {line}
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={`${styles.sideCard} whiteRoundedBox`}>
              <div className={styles.sideTitle}>Food &amp; Lodging</div>

              {trip.foodAndLodgingOverview ? (
                <div className={styles.sideText}>
                  {trip.foodAndLodgingOverview
                    .split("\n")
                    .filter(Boolean)
                    .map((p, idx) => (
                      <p key={idx} className={styles.sidePara}>
                        {p}
                      </p>
                    ))}
                </div>
              ) : (
                <div className={styles.sideEmpty}>
                  No food &amp; lodging overview provided.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <EmailSignup
        heading="Know before you book."
        subtext="Rankings and new trips, straight to you."
        buttonText="Sign up"
        extraBottomPadding={64}
      />
    </main>
  );
}
