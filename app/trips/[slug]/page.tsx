import { notFound } from "next/navigation";
import styles from "../../../styles/tripDetails.module.css";
import { getPublishedTripBySlug } from "../../../lib/airtable";
import { formatStayType, formatCostTier, formatRanking, formatDuration, formatDriving } from "../../../lib/formatters";

function statusLabel(status: string) {
  if (status === "must_play") return "MUST";
  if (status === "should_play") return "SHOULD";
  if (status === "want_more") return "WANT MORE";
  return status.toUpperCase();
}

function safeNum(n: number | undefined) {
  if (typeof n !== "number") return 0;
  return n;
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
    trip.heroImageUrl ||
    trip.thumbnailImageUrl ||
    `/images/trips/${trip.slug}-hero.jpg`;

  // Course tiles: keep ordering from TripCourses rank
  const courses = [...trip.courses].sort((a, b) => a.tripCourseRank - b.tripCourseRank);

  const mustPlay = courses.filter((c) => c.status === "must_play").map((c) => c.course.name);
  const shouldPlay = courses.filter((c) => c.status === "should_play").map((c) => c.course.name);
  const wantMore = courses.filter((c) => c.status === "want_more").map((c) => c.course.name);

  function joinNames(names: string[]) {
    return names.length ? names.join(", ") : "-";
  }

  return (
    <main className={styles.page}>
      {/* HERO */}
      <section className={styles.hero}>
        <div
          className={styles.heroMedia}
          style={{ backgroundImage: `url("${heroUrl}")` }}
          aria-hidden="true"
        />
        <div className={styles.heroOverlay} aria-hidden="true" />

        {/* Center floating card */}
        <div className={styles.heroInner}>
          <div className={styles.heroCard}>
            <div className={styles.heroTitle}>
              #{trip.currentRanking ?? "—"} {trip.name}
            </div>

            <div className={styles.heroScores}>
              <div className={styles.heroScore}>
                <div className={styles.heroScoreNum}>{safeNum(trip.golfRating)}</div>
                <div className={styles.heroScoreLabel}>Golf</div>
              </div>
              <div className={styles.heroScore}>
                <div className={styles.heroScoreNum}>{safeNum(trip.lodgingRating)}</div>
                <div className={styles.heroScoreLabel}>Lodging</div>
              </div>
              <div className={styles.heroScore}>
                <div className={styles.heroScoreNum}>{safeNum(trip.foodRating)}</div>
                <div className={styles.heroScoreLabel}>Food</div>
              </div>
              <div className={styles.heroScore}>
                <div className={styles.heroScoreNum}>{safeNum(trip.vibeRating)}</div>
                <div className={styles.heroScoreLabel}>Vibe</div>
              </div>

              <div className={styles.heroDivider} aria-hidden="true" />

              <div className={styles.heroOverall}>
                <div className={styles.heroOverallNum}>
                  {safeNum(trip.overallRating).toFixed(2)}
                </div>
                <div className={styles.heroOverallLabel}>Overall</div>
              </div>
            </div>
          </div>

          {/* Meta row below the blue card */}
          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Duration:</span>{" "}
              {formatDuration(trip.durationMinDays, trip.durationMaxDays)}
            </div>
            <span className={styles.metaDot} aria-hidden="true">
              •
            </span>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Driving:</span> {formatDriving(trip.driving)}
            </div>
            <span className={styles.metaDot} aria-hidden="true">
              •
            </span>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Stay Type:</span> {formatStayType(trip.stayType)}
            </div>
            <span className={styles.metaDot} aria-hidden="true">
              •
            </span>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Lead Time:</span> {trip.leadTime ?? "—"}
            </div>
            <span className={styles.metaDot} aria-hidden="true">
              •
            </span>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Cost:</span> {formatCostTier(trip.costTier)}
            </div>
          </div>

          <div className={styles.metaRule} aria-hidden="true" />
        </div>
      </section>

      {/* BODY */}
      <section className={styles.body}>
        {/* Course grid */}
        <div className={styles.courseGrid}>
          {courses.map((c) => {
            const img =
              c.course.thumbnailImageUrl ||
              `/images/courses/${c.course.slug.toLowerCase()}.jpg`;

            return (
              <div key={`${c.course.id}-${c.tripCourseRank}`} className={styles.courseCard}>
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
                    <div className={styles.rankNum}>{c.course.golfComRanking ?? "NR"}</div>
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

          <div className={styles.categorySection}>
            <div className={styles.categoryTitle}>Courses included:</div>

            <div className={styles.categoryRows}>
              <div className={styles.categoryRow}>
                <div className={styles.categoryLabel}>Must Play:</div>
                <div className={styles.categoryValue}>{joinNames(mustPlay)}</div>
              </div>

              <div className={styles.categoryRow}>
                <div className={styles.categoryLabel}>Should Play:</div>
                <div className={styles.categoryValue}>{joinNames(shouldPlay)}</div>
              </div>

              <div className={styles.categoryRow}>
                <div className={styles.categoryLabel}>Want More:</div>
                <div className={styles.categoryValue}>{joinNames(wantMore)}</div>
              </div>
            </div>
          </div>

          {/* Two-up detail section below */}
          <div className={styles.detailGrid}>
            <div className={styles.sideCard}>
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

            <div className={styles.sideCard}>
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
