import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedJourneyBySlug } from "@/lib/airtable";
import { formatDuration, formatCostTier } from "@/lib/formatters";
import JourneyChatPanel from "@/components/JourneyChatPanel";
import styles from "@/styles/journey.module.css";
import type { CourseImportance } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const journey = await getPublishedJourneyBySlug(slug);
  if (!journey) return {};
  return {
    title: `${journey.name} | GolfTripIndex`,
    description: journey.description ?? `A multi-day golf journey: ${journey.name}.`,
  };
}

function sortByRanking(courses: import("@/lib/types").JourneyStopCourse[]) {
  return [...courses].sort(
    (a, b) =>
      (a.course.consolidatedRanking ?? 9999) -
      (b.course.consolidatedRanking ?? 9999)
  );
}

function importanceLabel(importance: CourseImportance) {
  if (importance === "must_play") return "Must Play";
  if (importance === "should_play") return "Should Play";
  return "Optional";
}

function importanceBadgeClass(importance: CourseImportance, css: Record<string, string>) {
  if (importance === "must_play") return css.importanceMust;
  if (importance === "should_play") return css.importanceShould;
  return css.importanceOptional;
}

export default async function JourneyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const journey = await getPublishedJourneyBySlug(slug);
  if (!journey) return notFound();

  const heroUrl = journey.heroImageUrl ?? `/images/journeys/${journey.slug}.jpg`;

  const firstStop = journey.stops[0];
  const lastStop = journey.stops[journey.stops.length - 1];
  const isLoop =
    firstStop && lastStop && firstStop.locationName === lastStop.locationName;

  return (
    <main className={styles.page}>
      {/* HERO */}
      <section className={styles.hero}>
        <div
          className={styles.heroMedia}
          style={{ backgroundImage: `url("${heroUrl}")` }}
          aria-hidden="true"
        />

        <div className={styles.heroPanel}>
          <div className={styles.heroBadge}>Golf Journey</div>
          <h1 className={styles.heroTitle}>{journey.name}</h1>

          {journey.description && (
            <p className={styles.heroDesc}>{journey.description}</p>
          )}

          <div className={styles.heroMeta}>
            <div className={styles.heroMetaRow}>
              <span className={styles.heroMetaKey}>Duration</span>
              <span className={styles.heroMetaVal}>
                {formatDuration(journey.durationMinDays, journey.durationMaxDays)}
              </span>
            </div>

            {journey.costTier && (
              <div className={styles.heroMetaRow}>
                <span className={styles.heroMetaKey}>Cost</span>
                <span className={styles.heroMetaVal}>
                  {formatCostTier(journey.costTier)}
                </span>
              </div>
            )}

            {firstStop && lastStop && (
              <div className={styles.heroMetaRow}>
                <span className={styles.heroMetaKey}>Route</span>
                <span className={styles.heroMetaVal}>
                  {isLoop
                    ? `${firstStop.locationName} (loop)`
                    : `${firstStop.locationName} → ${lastStop.locationName}`}
                </span>
              </div>
            )}

            <div className={styles.heroMetaRow}>
              <span className={styles.heroMetaKey}>Stops</span>
              <span className={styles.heroMetaVal}>{journey.stops.length}</span>
            </div>
          </div>
        </div>
      </section>

      {/* BODY */}
      <div className={styles.pageBody}>
        {journey.stops.length === 0 ? (
            <p className={styles.empty}>Itinerary coming soon.</p>
          ) : (
            journey.stops.map((stop) => {
              const mustPlay = sortByRanking(stop.courses.filter((c) => c.importance === "must_play"));
              const shouldPlay = sortByRanking(stop.courses.filter((c) => c.importance === "should_play"));
              const optional = sortByRanking(stop.courses.filter((c) => c.importance === "want_more"));
              const orderedCourses = [...mustPlay, ...shouldPlay, ...optional];

              const showLogistics = stop.overnight && (stop.hotels || stop.restaurants);
              const hasBody = showLogistics || stop.bookingAdvice || stop.notes;

              return (
                <div key={stop.id} className={styles.stop}>
                  {/* Stop header */}
                  <div className={styles.stopHeader}>
                    <div className={styles.stopNumber}>{stop.stopOrder}</div>
                    <div className={styles.stopLocation}>{stop.locationName}</div>
                    <span
                      className={`${styles.stopBadge} ${
                        stop.overnight ? styles.badgeOvernight : styles.badgeDriveThrough
                      }`}
                    >
                      {stop.overnight ? "Overnight" : "Drive-through"}
                    </span>
                  </div>

                  {/* Course scroll row */}
                  {orderedCourses.length > 0 && (
                    <div className={styles.courseScroll}>
                      {orderedCourses.map((sc) => {
                        const img = `/images/courses/${sc.course.slug.toLowerCase()}.jpg`;
                        return (
                          <div key={sc.course.id} className={styles.courseCard}>
                            <div
                              className={styles.courseImage}
                              style={{ backgroundImage: `url("${img}")` }}
                              aria-hidden="true"
                            >
                              {sc.course.consolidatedRanking && (
                                <div className={styles.courseRankOverlay}>
                                  #{sc.course.consolidatedRanking}
                                </div>
                              )}
                              <div
                                className={`${styles.importanceBadge} ${importanceBadgeClass(sc.importance, styles)}`}
                              >
                                {importanceLabel(sc.importance)}
                              </div>
                            </div>
                            <div className={styles.courseName}>{sc.course.name}</div>
                            <div className={styles.courseRanks}>
                              <div className={styles.rankCell}>
                                <div className={styles.rankNum}>
                                  {sc.course.golfDigestRanking ?? "NR"}
                                </div>
                                <div className={styles.rankLabel}>Golf Digest</div>
                              </div>
                              <div className={styles.rankCell}>
                                <div className={styles.rankNum}>
                                  {sc.course.golfDotComRanking ?? "NR"}
                                </div>
                                <div className={styles.rankLabel}>Golf.com</div>
                              </div>
                              <div className={styles.rankCell}>
                                <div className={styles.rankNum}>
                                  {sc.course.golfweekRanking ?? "NR"}
                                </div>
                                <div className={styles.rankLabel}>Golfweek</div>
                              </div>
                              <div className={styles.rankCell}>
                                <div className={styles.rankNum}>
                                  {sc.course.consolidatedRanking ?? "NR"}
                                </div>
                                <div className={styles.rankLabel}>Overall</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Logistics / advice / notes */}
                  {hasBody && (
                    <div className={styles.stopBody}>
                      {showLogistics && (
                        <div className={styles.stopLogistics}>
                          {stop.hotels && (
                            <div className={styles.logisticsCard}>
                              <div className={styles.logisticsTitle}>Hotels</div>
                              <div className={styles.logisticsText}>{stop.hotels}</div>
                            </div>
                          )}
                          {stop.restaurants && (
                            <div className={styles.logisticsCard}>
                              <div className={styles.logisticsTitle}>Restaurants</div>
                              <div className={styles.logisticsText}>{stop.restaurants}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {stop.bookingAdvice && (
                        <div className={styles.bookingAdvice}>
                          <div className={styles.bookingAdviceTitle}>Booking Advice</div>
                          <div className={styles.bookingAdviceText}>{stop.bookingAdvice}</div>
                        </div>
                      )}

                      {stop.notes && (
                        <div className={styles.stopNotes}>{stop.notes}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
      </div>

      {/* Floating Journey Assistant */}
      <JourneyChatPanel
        journeySlug={journey.slug}
        journeyName={journey.name}
      />
    </main>
  );
}
