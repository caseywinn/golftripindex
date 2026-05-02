import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedJourneyBySlug, getPublishedJourneys } from "@/lib/airtable";
import { formatDuration, formatCostTier } from "@/lib/formatters";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

export const revalidate = 86400;
import JourneyMap from "@/components/JourneyMap";
import styles from "@/styles/journey.module.css";
import type { CourseImportance, JourneyStopCourse, MapStop } from "@/lib/types";

async function getDrivingPolyline(stops: { lat: number; lng: number }[]): Promise<string | null> {
  try {
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(";");
    const res = await fetch(
      `http://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=polyline`,
      { next: { revalidate: 86400 } }
    );
    const data = await res.json();
    return data.routes?.[0]?.geometry ?? null;
  } catch {
    return null;
  }
}

async function geocodeStop(name: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(name.split(/ and /i)[0].trim() + ", California");
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      {
        headers: { "User-Agent": "golftripindex/1.0 (caseywinn@gmail.com)" },
        next: { revalidate: 86400 },
      }
    );
    const data = await res.json();
    return data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const journeys = await getPublishedJourneys();
  return journeys.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const journey = await getPublishedJourneyBySlug(slug);
  if (!journey) return {};

  const description = journey.description ?? `A multi-day golf journey: ${journey.name}.`;
  const url = `${SITE_URL}/journeys/${slug}`;

  return {
    title: journey.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${journey.name} | ${SITE_NAME}`,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${journey.name} | ${SITE_NAME}`,
      description,
    },
  };
}

function sortByRanking(courses: JourneyStopCourse[]) {
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

  const heroUrl = `/images/journeys/${journey.slug}.jpg`;
  const totalStops = journey.stops.length;

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
  const mapStops: MapStop[] = (
    await Promise.all(
      journey.stops.map(async (stop) => {
        const coords = await geocodeStop(stop.locationName);
        if (!coords) return null;
        return { order: stop.stopOrder, name: stop.locationName, overnight: stop.overnight, ...coords };
      })
    )
  ).filter((s): s is MapStop => s !== null);

  const drivingPolyline = mapStops.length >= 2 ? await getDrivingPolyline(mapStops) : null;

  const firstStop = journey.stops[0];
  const lastStop = journey.stops[totalStops - 1];
  const isLoop = firstStop && lastStop && firstStop.locationName === lastStop.locationName;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Trips", item: `${SITE_URL}/trips` },
      { "@type": "ListItem", position: 3, name: journey.name, item: `${SITE_URL}/journeys/${journey.slug}` },
    ],
  };

  const journeySchema = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: journey.name,
    ...(journey.description ? { description: journey.description } : {}),
    url: `${SITE_URL}/journeys/${journey.slug}`,
    touristType: "Golf",
  };

  return (
    <main className={styles.page}>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={journeySchema} />

      {/* HERO — split grid matching trip details */}
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
                <span className={styles.heroMetaVal}>{formatCostTier(journey.costTier)}</span>
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
              <span className={styles.heroMetaVal}>{totalStops}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ROUTE STRIP — links anchor to each stop */}
      {totalStops > 0 && (
        <div className={styles.routeStrip}>
          <div className={styles.routeStripInner}>
            {journey.stops.map((stop, i) => (
              <span key={stop.id} className={styles.routeItem}>
                {i > 0 && <span className={styles.routeArrow} aria-hidden="true">→</span>}
                <a
                  href={`#stop-${stop.stopOrder}`}
                  className={stop.overnight ? styles.routeStopOvernight : styles.routeStopPass}
                >
                  {stop.locationName}
                </a>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* FULL DESCRIPTION */}
      {journey.fullDescription && (
        <section className={styles.fullDesc}>
          <div className={styles.fullDescInner}>
            <p className={styles.fullDescText}>{journey.fullDescription}</p>
          </div>
        </section>
      )}

      {/* ROUTE MAP — hidden until waypoint routing is configured */}
      {false && mapStops.length >= 2 && (
        <div className={styles.mapWrap}>
          <JourneyMap stops={mapStops} polyline={drivingPolyline} apiKey={mapsKey} />
        </div>
      )}

      {/* STOPS */}
      <div className={styles.pageBody}>
        {totalStops === 0 ? (
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
              <div key={stop.id} id={`stop-${stop.stopOrder}`} className={styles.stop}>

                {/* STOP HEADER */}
                <div className={styles.stopHeader}>
                  <div className={styles.stopMeta}>
                    <div className={styles.stopCounter}>Stop {stop.stopOrder} of {totalStops}</div>
                    <div className={styles.stopLocation}>{stop.locationName}</div>
                  </div>
                  <span className={`${styles.stopBadge} ${stop.overnight ? styles.badgeOvernight : styles.badgeDriveThrough}`}>
                    {stop.overnight ? "Overnight" : "Drive-through"}
                  </span>
                </div>

                {/* COURSE CAROUSEL */}
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
                            <div className={`${styles.importanceBadge} ${importanceBadgeClass(sc.importance, styles)}`}>
                              {importanceLabel(sc.importance)}
                            </div>
                          </div>
                          <div className={styles.courseName}>{sc.course.name}</div>
                          <div className={styles.courseRanks}>
                            <div className={styles.rankCell}>
                              <div className={styles.rankNum}>{sc.course.golfDigestRanking ?? "NR"}</div>
                              <div className={styles.rankLabel}>Golf Digest</div>
                            </div>
                            <div className={styles.rankCell}>
                              <div className={styles.rankNum}>{sc.course.golfDotComRanking ?? "NR"}</div>
                              <div className={styles.rankLabel}>Golf.com</div>
                            </div>
                            <div className={styles.rankCell}>
                              <div className={styles.rankNum}>{sc.course.golfweekRanking ?? "NR"}</div>
                              <div className={styles.rankLabel}>Golfweek</div>
                            </div>
                            <div className={styles.rankCell}>
                              <div className={styles.rankNum}>{sc.course.consolidatedRanking ?? "NR"}</div>
                              <div className={styles.rankLabel}>Overall</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* LOGISTICS */}
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

    </main>
  );
}
