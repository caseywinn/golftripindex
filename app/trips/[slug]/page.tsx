import { notFound } from "next/navigation";
import type { Metadata } from "next";
import styles from "../../../styles/tripDetails.module.css";
import { getPublishedTripBySlug } from "../../../lib/airtable";
import {
  formatStayType,
  formatCostTier,
  formatDuration,
  formatDriving,
} from "../../../lib/formatters";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const trip = await getPublishedTripBySlug(slug);
  console.log("TRIP:", trip?.slug, "courses:", trip?.courses?.length);
  if (trip?.courses?.length) {
    console.log("FIRST COURSE SHAPE:", trip.courses[0]);
  }

  if (!trip) return {};

  return {
    title: `${trip.name} | GolfTripIndex`,
    description: 'An in-depth rating and review of a golf trip to ${trip.name}, covering course architecture, lodging, food, vibe, and the overall trip experience.',
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

  const trip = await getPublishedTripBySlug(slug);
  if (!trip) return notFound();

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

  return (
    <main className={styles.page}>
      {/* HERO */}
      <section className={styles.banner}>
        <div
          className={styles.bannerMedia}
          style={{ backgroundImage: `url("${heroUrl}")` }}
          aria-hidden="true"
        />

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

                <div className={styles.bannerMetaRow}>
                  <span className={styles.bannerMetaKey}>Driving:</span>
                  <span className={styles.bannerMetaVal}>
                    {formatDriving(trip.driving)}
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
                  <div
                    className={styles.courseImage}
                    style={{ backgroundImage: `url("${img}")` }}
                    aria-hidden="true"
                  >
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
                  <div
                    className={styles.courseImage}
                    style={{ backgroundImage: `url("${img}")` }}
                    aria-hidden="true"
                  >
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
    </main>
  );
}
