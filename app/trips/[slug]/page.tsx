import { notFound } from "next/navigation";
import type { Metadata } from "next";
import hero from "../../../styles/tripDetails.module.css";
import dt from "../../../styles/designTrip.module.css";
import TocNav from "../../design-trip/TocNav";
import ItineraryToggle from "../../design-trip/ItineraryToggle";
import CourseCarousel from "../../design-trip/CourseCarousel";
import SideTripCarousel from "../../design-trip/SideTripCarousel";
import CompareWidget from "../../../components/CompareWidget";
import {
  formatStayType,
  formatCostTier,
  formatDuration,
  formatDriving,
} from "../../../lib/formatters";
import EmailSignup from "@/components/EmailSignup";
import SaveButton from "@/components/SaveButton";
import ShareButton from "@/components/ShareButton";
import { ProseMarkdown, LodgingMarkdown, PackMarkdown } from "../../design-trip/TripMarkdown";
import JumpToSection from "../../design-trip/JumpToSection";
import AskCaddieInline from "../../design-trip/AskCaddieInline";
import CostTable from "../../design-trip/CostTable";
import { getPublishedTripFull, getPublishedTrips } from "@/lib/airtable";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_ABBR: Record<string, string> = {
  January: "Jan", February: "Feb", March: "Mar", April: "Apr",
  May: "May", June: "Jun", July: "Jul", August: "Aug",
  September: "Sep", October: "Oct", November: "Nov", December: "Dec",
};

const MONTH_SEASON: Record<string, string> = {
  December: "Winter", January: "Winter", February: "Winter",
  March: "Spring", April: "Spring", May: "Spring",
  June: "Summer", July: "Summer", August: "Summer", September: "Summer",
  October: "Fall", November: "Fall",
};

function abbreviateMonths(months: string[] | undefined): string | undefined {
  if (!months?.length) return undefined;
  return months.map((m) => MONTH_ABBR[m] ?? m).join(", ");
}

function deriveSeasonName(months: string[]): string {
  const order = ["Spring", "Summer", "Fall", "Winter"];
  const found = order.filter((s) => months.some((m) => MONTH_SEASON[m] === s));
  if (found.length === 0) return "";
  if (found.length <= 2) return found.join(" & ");
  return found.join(", ");
}
import { SITE_URL, tripHeadingQualifier, tripReviewTitle, tripWebPageSchema } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

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
  const trip = await getPublishedTripFull(slug);
  if (!trip) return {};

  const description =
    trip.seoDescription ||
    `GolfTripIndex rates the full ${trip.name} golf trip — courses, lodging, food, and cost. Find out if it's worth your group's next trip.`;
  const url = `${SITE_URL}/trips/${slug}`;
  const title = tripReviewTitle(trip.name, trip.overallRating);

  return {
    // absolute: skip the root layout's "%s | Golf Trip Index" template
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      // siteName is already set in the root layout, so no brand suffix here
      title,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function parseBulletRules(raw: string | undefined): { head: string; text: string }[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return { head: "", text: line.trim() };
      return {
        head: line.slice(0, colonIdx).trim(),
        text: line.slice(colonIdx + 1).trim(),
      };
    })
    .filter((r) => r.text.length > 0);
}

function parseLines(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split("\n").filter((line) => line.trim().length > 0);
}

function safeInt(n: number | undefined) {
  if (typeof n !== "number") return 0;
  return Math.floor(n);
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
  const [trip, allTrips] = await Promise.all([
    getPublishedTripFull(slug),
    getPublishedTrips(),
  ]);
  if (!trip) return notFound();

  const otherTrips = allTrips
    .filter((t) => t.slug !== slug)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ slug: t.slug, name: t.name }));

  const heroUrl = `/images/trips/${trip.slug}.jpg`;

  const carouselCourses = trip.courses
    .filter((c) => c.status === "must_play" || c.status === "should_play")
    .sort((a, b) => a.tripCourseRank - b.tripCourseRank)
    .map((c) => ({
      id: c.course.id,
      slug: c.course.slug,
      name: c.course.name,
      status: c.status as "must_play" | "should_play",
      consolidatedRanking: c.course.consolidatedRanking ?? null,
      golfDigestRanking: c.course.golfDigestRanking ?? null,
      golfDotComRanking: c.course.golfDotComRanking ?? null,
      golfweekRanking: c.course.golfweekRanking ?? null,
      tripCourseRank: c.tripCourseRank,
    }));

  const teeTimeRules = parseBulletRules(trip.teeTimeRules);
  const mistakes = parseBulletRules(trip.commonMistakes);
  const fitYes = parseLines(trip.fitYes);
  const fitNo = parseLines(trip.fitNo);

  const verdictText = trip.verdict || trip.overview;

  const peakLabel = abbreviateMonths(trip.peakMonths);
  const peakBullets = parseLines(trip.peakNotes);
  const peakSeasonName = trip.peakSeasonName || (trip.peakMonths?.length ? deriveSeasonName(trip.peakMonths) : undefined);
  const shoulderLabel = abbreviateMonths(trip.shoulderMonths);
  const shoulderBullets = parseLines(trip.shoulderNotes);
  const shoulderSeasonName = trip.shoulderSeasonName || (trip.shoulderMonths?.length ? deriveSeasonName(trip.shoulderMonths) : undefined);

  const allMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const peakSet = new Set(trip.peakMonths ?? []);
  const shoulderSet = new Set(trip.shoulderMonths ?? []);
  const offPeakMonths = allMonths.filter((m) => !peakSet.has(m) && !shoulderSet.has(m));
  const offPeakLabel = offPeakMonths.length < 12 ? abbreviateMonths(offPeakMonths) : undefined;
  const offPeakSeasonName = trip.offSeasonName || (offPeakMonths.length > 0 && offPeakMonths.length < 12 ? deriveSeasonName(offPeakMonths) : undefined);
  const offPeakBullets = parseLines(trip.offSeasonNotes);

  const costShoulderHeader = peakLabel ? `Shoulder (${abbreviateMonths(trip.shoulderMonths) ?? "off-peak"})` : "Shoulder season";
  const costPeakHeader = peakLabel ? `Peak (${peakLabel})` : "Peak season";

  const showWhenToGo = peakLabel || shoulderLabel || offPeakLabel;

  const jumpSections = [
    ...(verdictText ? [{ id: "verdict", label: "Our take" }] : []),
    ...(carouselCourses.length > 0 ? [{ id: "courses", label: "Courses included" }] : []),
    ...(trip.fullDescription ? [{ id: "experience", label: "The trip experience" }] : []),
    ...((trip.sideTrips.length > 0 || trip.wantMore) ? [{ id: "side-trips", label: "Side trips & bonus golf" }] : []),
    ...((fitYes.length > 0 || fitNo.length > 0) ? [{ id: "fit", label: "Is this trip right for you?" }] : []),
    ...(showWhenToGo ? [{ id: "when", label: "When to go" }] : []),
    ...(trip.costRows.length > 0 ? [{ id: "cost", label: "Budget" }] : []),
    ...(teeTimeRules.length > 0 ? [{ id: "tee-times", label: "Tee times" }] : []),
    ...(mistakes.length > 0 ? [{ id: "mistakes", label: "Common mistakes" }] : []),
    ...((trip.packBring || trip.packLeave) ? [{ id: "pack", label: "What to pack" }] : []),
    ...((trip.itinerary.min.length > 0 || trip.itinerary.max.length > 0) ? [{ id: "itinerary", label: "Sample itinerary" }] : []),
    ...((trip.lodging || trip.dining) ? [{ id: "stay", label: "Where to stay & eat" }] : []),
  ];

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Trips", item: `${SITE_URL}/trips` },
      { "@type": "ListItem", position: 3, name: trip.name, item: `${SITE_URL}/trips/${trip.slug}` },
    ],
  };

  const tripSchema = tripWebPageSchema(trip);

  const faqEntries: { question: string; answer: string }[] = [];

  if (carouselCourses.length > 0) {
    const courseNames = carouselCourses.map((c) => c.name).join(", ");
    faqEntries.push({
      question: `Which courses should I play at ${trip.name}?`,
      answer: `The top-ranked courses at ${trip.name} are: ${courseNames}. These are rated must-play or should-play by the Golf Trip Index panel based on architecture, routing, and overall experience.`,
    });
  }

  if (trip.peakMonths?.length) {
    const peakStr = abbreviateMonths(trip.peakMonths);
    const peakNoteStr = peakBullets.length > 0 ? ` ${peakBullets[0]}` : "";
    faqEntries.push({
      question: `When is the best time to visit ${trip.name}?`,
      answer: `Peak season is ${peakStr}.${peakNoteStr}${trip.peakVerdict ? ` ${trip.peakVerdict}` : ""}`,
    });
  }

  if (teeTimeRules.length > 0) {
    const rulesText = teeTimeRules
      .slice(0, 3)
      .map((r) => (r.head ? `${r.head}: ${r.text}` : r.text))
      .join(" ");
    faqEntries.push({
      question: `How do tee times and lodging work at ${trip.name}?`,
      answer: rulesText,
    });
  }

  if (trip.packBring) {
    const packLines = parseLines(trip.packBring).slice(0, 4).join(", ");
    faqEntries.push({
      question: `What should I pack for a ${trip.name} golf trip?`,
      answer: `Key items to bring: ${packLines}.${trip.packLeave ? ` Leave at home: ${parseLines(trip.packLeave).slice(0, 3).join(", ")}.` : ""}`,
    });
  }

  if (mistakes.length > 0) {
    const mistakeText = mistakes
      .slice(0, 2)
      .map((m) => (m.head ? `${m.head}: ${m.text}` : m.text))
      .join(" ");
    faqEntries.push({
      question: `What are common mistakes on a ${trip.name} golf trip?`,
      answer: mistakeText,
    });
  }

  const faqSchema = faqEntries.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  } : null;

  return (
    <main>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={tripSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className={hero.banner}>
        <div
          className={hero.bannerMedia}
          style={{ backgroundImage: `url("${heroUrl}")` }}
        >
          <ShareButton itemType="trip" itemId={slug} itemName={trip.name} variant="dark" corner />
        </div>

        <div className={hero.bannerPanel}>
          <div className={hero.bannerInner}>
            <div className={hero.bannerHeader}>
              <h1 className={hero.bannerTitle}>
                {trip.name}
                <span className={hero.bannerTitleQualifier}>
                  {tripHeadingQualifier(trip.name)}
                </span>
              </h1>
              {trip.subheader && (
                <p className={hero.bannerDeck}>{trip.subheader}</p>
              )}
              <div className={hero.bannerSave}>
                <SaveButton itemType="trip" itemId={slug} variant="dark" />
              </div>
            </div>

            <div className={hero.bannerRule} aria-hidden="true" />

            <div className={hero.bannerBody}>
              <div className={hero.bannerMeta}>
                <div className={hero.bannerMetaRow}>
                  <span className={hero.bannerMetaKey}>Duration:</span>
                  <span className={hero.bannerMetaVal}>
                    {formatDuration(trip.durationMinDays, trip.durationMaxDays)}
                  </span>
                </div>
                <div className={`${hero.bannerMetaRow} ${hero.metaTooltipWrapper}`}>
                  <span className={hero.bannerMetaKey}>Driving:</span>
                  <span className={hero.bannerMetaVal}>
                    {formatDriving(trip.driving)}
                    <i className={hero.metaTooltipIcon} aria-label="More info">i</i>
                  </span>
                  <span className={hero.metaTooltip}>
                    Driving between courses and lodging during the trip. Does not include travel to or from an airport.
                  </span>
                </div>
                <div className={hero.bannerMetaRow}>
                  <span className={hero.bannerMetaKey}>Stay Type:</span>
                  <span className={hero.bannerMetaVal}>{formatStayType(trip.stayType)}</span>
                </div>
                <div className={hero.bannerMetaRow}>
                  <span className={hero.bannerMetaKey}>Lead Time:</span>
                  <span className={hero.bannerMetaVal}>{trip.leadTime ?? "—"}</span>
                </div>
                <div className={hero.bannerMetaRow}>
                  <span className={hero.bannerMetaKey}>Cost:</span>
                  <span className={hero.bannerMetaVal}>{formatCostTier(trip.costTier)}</span>
                </div>
              </div>

              <div className={hero.bannerScores}>
                <div className={hero.bannerScoreRow}>
                  <span className={hero.bannerScoreKey}>Golf:</span>
                  <span className={hero.bannerScoreVal}>{safeInt(trip.golfRating)}</span>
                </div>
                <div className={hero.bannerScoreRow}>
                  <span className={hero.bannerScoreKey}>Lodging:</span>
                  <span className={hero.bannerScoreVal}>{safeInt(trip.lodgingRating)}</span>
                </div>
                <div className={hero.bannerScoreRow}>
                  <span className={hero.bannerScoreKey}>Food:</span>
                  <span className={hero.bannerScoreVal}>{safeInt(trip.foodRating)}</span>
                </div>
                <div className={hero.bannerScoreRow}>
                  <span className={hero.bannerScoreKey}>Vibe:</span>
                  <span className={hero.bannerScoreVal}>{safeInt(trip.vibeRating)}</span>
                </div>
                <div className={hero.bannerScoreRowOverall}>
                  <span className={hero.bannerScoreKey}>Overall:</span>
                  <span className={hero.bannerOverallVal}>{safeNum(trip.overallRating).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CompareWidget tripName={trip.name} currentSlug={slug} trips={otherTrips} />

      {/* ── BODY LAYOUT: TOC rail + main content ──────────────── */}
      <div className={dt.body}>
        <div className={dt.bodyLayout}>

          {/* LEFT RAIL TOC */}
          <aside className={dt.tocRail}>
            <TocNav />
          </aside>

          {/* MAIN CONTENT */}
          <div className={dt.mainContent}>

            <JumpToSection sections={jumpSections} />

            {/* ── VERDICT ────────────────────────────────────────── */}
            {verdictText && (
              <>
                <section id="verdict" className={dt.section}>
                  <div className={dt.sectionLabel}>Our take</div>
                  <p className={dt.verdictText}>{verdictText}</p>
                  <AskCaddieInline />
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── COURSES ────────────────────────────────────────── */}
            {carouselCourses.length > 0 && (
              <>
                <section id="courses" className={dt.section}>
                  <div className={dt.sectionLabel}>What you play</div>
                  <h2 className={dt.sectionTitle}>Courses included</h2>
                  <CourseCarousel courses={carouselCourses} />
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── THE EXPERIENCE ──────────────────────────────────── */}
            {trip.fullDescription && (
              <>
                <section id="experience" className={dt.section}>
                  <div className={dt.sectionLabel}>Review</div>
                  <h2 className={dt.sectionTitle}>The trip experience</h2>
                  <ProseMarkdown content={trip.fullDescription} />
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── SIDE TRIPS ──────────────────────────────────────── */}
            {(trip.sideTrips.length > 0 || trip.wantMore) && (
              <>
                <section id="side-trips" className={dt.section}>
                  <div className={dt.sectionLabel}>While you&apos;re there</div>
                  <h2 className={dt.sectionTitle}>Side trips &amp; bonus golf</h2>
                  {trip.sideTrips.length > 0 && <SideTripCarousel items={trip.sideTrips} />}
                  {trip.wantMore && (
                    <div className={dt.wantMoreBlock}>
                      <ProseMarkdown content={trip.wantMore} />
                    </div>
                  )}
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── IS THIS TRIP RIGHT FOR YOU? ─────────────────────── */}
            {(fitYes.length > 0 || fitNo.length > 0) && (
              <>
                <section id="fit" className={dt.section}>
                  <div className={dt.sectionLabel}>Fit</div>
                  <h2 className={dt.sectionTitle}>Is this trip right for your group?</h2>
                  <div className={dt.fitGrid}>
                    {fitYes.length > 0 && (
                      <div className={`${dt.fitCard} ${dt.fitCardYes}`}>
                        <div className={`${dt.fitCardTitle} ${dt.fitCardTitleYes}`}>Book this trip if…</div>
                        <ul className={dt.fitList}>
                          {fitYes.map((item) => (
                            <li key={item} className={dt.fitItem}>
                              <span className={dt.fitIcon}>✓</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {fitNo.length > 0 && (
                      <div className={`${dt.fitCard} ${dt.fitCardNo}`}>
                        <div className={`${dt.fitCardTitle} ${dt.fitCardTitleNo}`}>Skip this trip if…</div>
                        <ul className={dt.fitList}>
                          {fitNo.map((item) => (
                            <li key={item} className={dt.fitItem}>
                              <span className={dt.fitIcon}>✗</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── WHEN TO GO ──────────────────────────────────────── */}
            {showWhenToGo && (
              <>
                <section id="when" className={dt.section}>
                  <div className={dt.sectionLabel}>Timing</div>
                  <h2 className={dt.sectionTitle}>When to go</h2>

                  <div className={dt.seasonGrid}>
                    {peakLabel && (
                      <div className={`${dt.seasonCard} ${dt.seasonCardPeak}`}>
                        <div className={`${dt.seasonTagline} ${dt.seasonTaglinePeak}`}>Peak</div>
                        {peakSeasonName && <div className={dt.seasonName}>{peakSeasonName}</div>}
                        <div className={dt.seasonMonths}>{peakLabel}</div>
                        {peakBullets.length > 0 && (
                          <ul className={dt.seasonPoints}>
                            {peakBullets.map((pt) => (
                              <li key={pt} className={dt.seasonPoint}>
                                <span className={`${dt.seasonDot} ${dt.seasonDotPeak}`} />
                                {pt}
                              </li>
                            ))}
                          </ul>
                        )}
                        {trip.peakVerdict && <div className={dt.seasonVerdict}>{trip.peakVerdict}</div>}
                      </div>
                    )}
                    {shoulderLabel && (
                      <div className={`${dt.seasonCard} ${dt.seasonCardShoulder}`}>
                        <div className={`${dt.seasonTagline} ${dt.seasonTaglineShoulder}`}>Shoulder</div>
                        {shoulderSeasonName && <div className={dt.seasonName}>{shoulderSeasonName}</div>}
                        <div className={dt.seasonMonths}>{shoulderLabel}</div>
                        {shoulderBullets.length > 0 && (
                          <ul className={dt.seasonPoints}>
                            {shoulderBullets.map((pt) => (
                              <li key={pt} className={dt.seasonPoint}>
                                <span className={`${dt.seasonDot} ${dt.seasonDotShoulder}`} />
                                {pt}
                              </li>
                            ))}
                          </ul>
                        )}
                        {trip.shoulderVerdict && <div className={dt.seasonVerdict}>{trip.shoulderVerdict}</div>}
                      </div>
                    )}
                    {offPeakLabel && (
                      <div className={`${dt.seasonCard} ${dt.seasonCardOff}`}>
                        <div className={`${dt.seasonTagline} ${dt.seasonTaglineOff}`}>Off-Season</div>
                        {offPeakSeasonName && <div className={dt.seasonName}>{offPeakSeasonName}</div>}
                        <div className={dt.seasonMonths}>{offPeakLabel}</div>
                        {offPeakBullets.length > 0 && (
                          <ul className={dt.seasonPoints}>
                            {offPeakBullets.map((pt) => (
                              <li key={pt} className={dt.seasonPoint}>
                                <span className={`${dt.seasonDot} ${dt.seasonDotOff}`} />
                                {pt}
                              </li>
                            ))}
                          </ul>
                        )}
                        {trip.offSeasonVerdict && <div className={dt.seasonVerdict}>{trip.offSeasonVerdict}</div>}
                      </div>
                    )}
                  </div>
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── COST ────────────────────────────────────────────── */}
            {trip.costRows.length > 0 && (
              <>
                <section id="cost" className={dt.section}>
                  <div className={dt.sectionLabel}>Budget</div>
                  <h2 className={dt.sectionTitle}>What a {trip.name} trip costs</h2>

                  <CostTable rows={trip.costRows} costNote={trip.costNote} />
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── TEE TIMES ───────────────────────────────────────── */}
            {teeTimeRules.length > 0 && (
              <>
                <section id="tee-times" className={dt.section}>
                  <div className={dt.sectionLabel}>Logistics</div>
                  <h2 className={dt.sectionTitle}>How tee times and lodging actually work</h2>

                  <ol className={dt.numberedList}>
                    {teeTimeRules.map((rule, i) => (
                      <li key={rule.head || i} className={dt.numberedItem}>
                        <div className={dt.numberedBadge}>{i + 1}</div>
                        <div>
                          <div className={dt.numberedHead}>{rule.head}</div>
                          <div className={dt.numberedText}>{rule.text}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── COMMON MISTAKES ─────────────────────────────────── */}
            {mistakes.length > 0 && (
              <>
                <section id="mistakes" className={dt.section}>
                  <div className={dt.sectionLabel}>Watch out for</div>
                  <h2 className={dt.sectionTitle}>Common mistakes</h2>

                  <ul className={dt.mistakeList}>
                    {mistakes.map((m, i) => (
                      <li key={m.head || i} className={dt.mistakeItem}>
                        <span className={dt.mistakeIconBadge}>!</span>
                        <div>
                          <div className={dt.mistakeHead}>{m.head}</div>
                          <div className={dt.mistakeText}>{m.text}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── PACK LIST ───────────────────────────────────────── */}
            {(trip.packBring || trip.packLeave) && (
              <>
                <section id="pack" className={dt.section}>
                  <div className={dt.sectionLabel}>Prep</div>
                  <h2 className={dt.sectionTitle}>What to pack</h2>

                  <div className={dt.packColumns}>
                    {trip.packBring && (
                      <div className={dt.packGroup}>
                        <div className={dt.packGroupLabel}>Bring</div>
                        <PackMarkdown content={trip.packBring} variant="bring" />
                      </div>
                    )}
                    {trip.packLeave && (
                      <div className={dt.packGroup}>
                        <div className={dt.packGroupLabel}>Leave at home</div>
                        <PackMarkdown content={trip.packLeave} variant="leave" />
                      </div>
                    )}
                  </div>
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── ITINERARY ───────────────────────────────────────── */}
            {(trip.itinerary.min.length > 0 || trip.itinerary.max.length > 0) && (
              <>
                <section id="itinerary" className={dt.section}>
                  <div className={dt.sectionLabel}>Sample schedule</div>
                  <h2 className={dt.sectionTitle}>Sample itinerary</h2>

                  <ItineraryToggle
                    minItinerary={trip.itinerary.min}
                    maxItinerary={trip.itinerary.max}
                    footnote={trip.sampleItineraryNotes ?? ""}
                    defaultTab={trip.durationMinDays === 2 && trip.durationMaxDays === 3 ? "max" : undefined}
                  />
                </section>

                <hr className={dt.sectionDivider} />
              </>
            )}

            {/* ── STAY & EAT ──────────────────────────────────────── */}
            {(trip.lodging || trip.dining) && (
              <>
                <section id="stay" className={dt.section}>
                  <div className={dt.sectionLabel}>On property</div>
                  <h2 className={dt.sectionTitle}>Where to stay &amp; eat</h2>

                  {trip.lodging && <LodgingMarkdown content={trip.lodging} label="Lodging" />}
                  {trip.dining && <LodgingMarkdown content={trip.dining} label="Dining" />}
                </section>
              </>
            )}

          </div>{/* end mainContent */}
        </div>{/* end bodyLayout */}
      </div>{/* end body */}

      <EmailSignup
        heading="Know before you book."
        subtext="Rankings and new trips, straight to you."
        buttonText="Sign up"
        extraBottomPadding={64}
      />
    </main>
  );
}
