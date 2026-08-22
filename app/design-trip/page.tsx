import type { Metadata } from "next";
import hero from "../../styles/tripDetails.module.css";
import dt from "../../styles/designTrip.module.css";
import TocNav from "./TocNav";
import ItineraryToggle from "./ItineraryToggle";
import CourseCarousel from "./CourseCarousel";
import SideTripCarousel from "./SideTripCarousel";
import CompareWidget from "../../components/CompareWidget";
import {
  formatStayType,
  formatCostTier,
  formatDuration,
  formatDriving,
} from "../../lib/formatters";
import EmailSignup from "@/components/EmailSignup";
import SaveButton from "@/components/SaveButton";
import ShareButton from "@/components/ShareButton";
import { ProseMarkdown, LodgingMarkdown, PackMarkdown } from "./TripMarkdown";
import { tripHeadingQualifier } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Trip Detail Design | Golf Trip Index",
  robots: { index: false, follow: false },
};

// ── Static Bandon Dunes data ──────────────────────────────────────────────────

const trip = {
  slug: "bandon-dunes",
  name: "Bandon Dunes",
  subheader: "Five world-class links courses on the Oregon coast — all on one property, all walkable.",
  overview:
    "Bandon Dunes is the rare destination that exceeds its reputation. Five world-class links courses on the Oregon coast, all walkable from each other and from your room. No rental cars. No tee times to chase across town. Just golf, in one of the most dramatic settings in American travel.",
  fullDescription: `Pacific Dunes is the jewel. A routing that follows the clifftops so closely that three consecutive holes play directly above the Pacific, exposed to whatever the coast throws at you. It rewards the bump-and-run and punishes the aerial game, genuinely Scottish in feel, entirely its own in setting.

> "Pacific Dunes is the best links course in America. It is not particularly close."

Bandon Dunes, the original, has aged beautifully. The opening nine routes through dense coastal forest before emerging onto headland terrain that frames the back nine. The contrast is one of the more dramatic mid-round moments in golf.

Old Macdonald takes the template-hole concept seriously, every hole an homage to classical design, and pulls it off with enough originality to feel like more than an exercise. Bandon Trails is the inland card, routing through gorse and meadow, and consistently underplayed by first-timers who should know better.

The Sheep Ranch is the newest addition and arguably the most dramatic. Fourteen holes sit directly on the bluffs above the Pacific. On a clear morning, the views are cinematic. On a gray, wind-swept afternoon, it becomes something else entirely.`,

  wantMore: `Returning visitors should prioritize a second round at the Sheep Ranch. It rewards familiarity in a way Pacific Dunes doesn't. If you have a sixth day and want a change of scenery, Bandon Crossings is a short drive from the resort and a solid Tom Doak design. Not at the level of the five main courses, but a legitimate round of golf and a welcome break from pure links terrain.`,

  durationMinDays: 4,
  durationMaxDays: 6,
  driving: "Minimal (on property)",
  stayType: "on_property" as const,
  leadTime: "12–18 months",
  costTier: 5 as const,

  golfRating: 10,
  lodgingRating: 9,
  foodRating: 8,
  vibeRating: 10,
  overallRating: 9.50,
};

const courses = [
  {
    id: "c1", slug: "pacific-dunes", name: "Pacific Dunes",
    consolidatedRanking: 5, golfDigestRanking: 6, golfDotComRanking: 8, golfweekRanking: 3,
    status: "must_play" as const,  tripCourseRank: 1,
  },
  {
    id: "c2", slug: "sheep-ranch", name: "Sheep Ranch",
    consolidatedRanking: 11, golfDigestRanking: 12, golfDotComRanking: 15, golfweekRanking: 8,
    status: "must_play" as const, tripCourseRank: 2,
  },
  {
    id: "c3", slug: "bandon-dunes-course", name: "Bandon Dunes",
    consolidatedRanking: 22, golfDigestRanking: 30, golfDotComRanking: 25, golfweekRanking: 15,
    status: "should_play" as const, tripCourseRank: 3,
  },
  {
    id: "c4", slug: "bandon-trails", name: "Bandon Trails",
    consolidatedRanking: 46, golfDigestRanking: 60, golfDotComRanking: 45, golfweekRanking: 35,
    status: "should_play" as const, tripCourseRank: 4,
  },
  {
    id: "c5", slug: "old-macdonald", name: "Old Macdonald",
    consolidatedRanking: 62, golfDigestRanking: 75, golfDotComRanking: 65, golfweekRanking: 50,
    status: "should_play" as const, tripCourseRank: 5,
  },
];

const mustPlay  = courses.filter(c => c.status === "must_play").map(c => c.name);
const shouldPlay = courses.filter(c => c.status === "should_play").map(c => c.name);

const groupFitYes = [
  "Plays 2–5 rounds per person per trip",
  "Prefers walking to riding",
  "Values course quality above lodging amenities",
  "Can commit to booking 12+ months in advance",
  "Comfortable at $3,000–5,000 per person all-in",
  "Wants the definitive American links experience",
];

const groupFitNo = [
  "Has non-golfers who need programming",
  "Needs warm or stable weather",
  "Requires 4-star hotel amenities",
  "Working with a budget under $2,500 per person",
  "Can only book 3–6 months out",
];

const costRows = [
  { line: "Tee fees — 5 rounds", shoulder: "$1,400–1,750", peak: "$1,900–2,200" },
  { line: "Lodging — 4 nights", shoulder: "$500–900", peak: "$1,100–1,600" },
  { line: "Food & drink on property", shoulder: "$300–400", peak: "$400–600" },
  { line: "Travel (flight + drive)", shoulder: "$350–500", peak: "$350–500" },
  { line: "Caddie", shoulder: "$450–600", peak: "$500–700", optional: true },
];

const teeTimeRules = [
  {
    head: "Lodging drives access",
    text: "Guests who book a room get priority tee time access. Lodge reservations open 13 months in advance. Call the resort to book lodging and tee times together.",
  },
  {
    head: "Day-guest slots are limited",
    text: "Non-guests can book tee times 30 days in advance. Availability is intentionally scarce — peak dates fill within minutes of release.",
  },
  {
    head: "Walking only",
    text: "No carts on any of the five courses, except for documented medical need. Budget 4–5 hours per round on a walking basis.",
  },
  {
    head: "Caddies are worth it",
    text: "Forecaddies run $65–75/bag plus tip; loop caddies $100–120/bag plus tip. At minimum, hire one for Pacific Dunes — the course reads differently with local knowledge.",
  },
  {
    head: "Large groups split tee times",
    text: "Parties of 5 or more play across two consecutive tee times. The resort slots them close. Plan accordingly.",
  },
  {
    head: "Sheep Ranch operates separately",
    text: "Booking for the Sheep Ranch runs through a separate system. Confirm availability specifically — it is the newest course and fills differently than the others.",
  },
];

const mistakes = [
  {
    head: "Booking too late",
    text: "Six months feels like enough. It's not. Peak summer dates require year-plus lead time. Book a shoulder-season trip first if you can't commit that far out.",
  },
  {
    head: "Skipping Bandon Trails",
    text: "The inland course gets deprioritized because it's not on the cliff. It shouldn't. Bandon Trails is a top-50 course with a routing that surprises most groups.",
  },
  {
    head: "Playing too many rounds per day",
    text: "Two rounds a day for four days sounds efficient. By day three, it's not fun. Most groups peak at 5–7 rounds over a 4–5 day trip.",
  },
  {
    head: "Never hiring a caddie",
    text: "Bandon is walkable by design. But a caddie at Pacific Dunes — even just once — pays off in course management and trip stories.",
  },
  {
    head: "Flying into Portland without checking North Bend",
    text: "Portland is a 3-hour drive. North Bend (OTH) is 30 minutes and has daily service from San Francisco and Los Angeles. Check fares before defaulting to PDX.",
  },
  {
    head: "Underpacking for weather",
    text: "June on the Oregon coast is not summer. It's 55°F and wind. Rain gloves, waterproof pants, and a windproof jacket are mandatory, not optional.",
  },
];

const packBring = `Waterproof jacket (non-negotiable)
Rain pants
Merino base layer (1–2)
Rain gloves — 2 pairs
Comfortable walking shoes
Sun protection for rare clear days
Wind-resistant hat or beanie
Warm mid-layer for evenings`;

const packLeave = `Cart bag
Flip-flops or sandals
Expectations of warm weather
Formal clothes`;

const itinerary4 = [
  {
    day: "Day 1",
    schedule: "Arrive North Bend · Bandon Dunes (PM)",
    note: "A first look at the property. An afternoon round on the original course gets your legs under you for the week.",
  },
  {
    day: "Day 2",
    schedule: "Pacific Dunes (AM) · Sheep Ranch (PM)",
    note: "The two most dramatic courses, back to back. Save energy for the afternoon — Sheep Ranch's clifftop views reward patience.",
  },
  {
    day: "Day 3",
    schedule: "Bandon Trails (AM) · Old Macdonald (PM)",
    note: "The inland card in the morning, the template course in the afternoon. The most underrated day of the trip.",
  },
  {
    day: "Day 4",
    schedule: "Pacific Dunes replay (AM) · Depart",
    note: "The mandatory second round, then out. North Bend to PDX is 3 hours if you're flying home.",
  },
];

const itinerary6 = [
  {
    day: "Day 1",
    schedule: "Arrive North Bend · Bandon Dunes (PM)",
    note: "A first look at the property. Settle in and get your legs under you.",
  },
  {
    day: "Day 2",
    schedule: "Pacific Dunes (AM) · Sheep Ranch (PM)",
    note: "The two most dramatic courses, back to back. Save afternoon energy for Sheep Ranch's clifftop views.",
  },
  {
    day: "Day 3",
    schedule: "Bandon Trails (AM) · Old Macdonald (PM)",
    note: "The inland card in the morning, the template course in the afternoon. The most underrated day of the trip.",
  },
  {
    day: "Day 4",
    schedule: "Pacific Dunes replay",
    note: "Every group that plays Pacific Dunes once plays it twice. This is where the handicap gets interesting.",
  },
  {
    day: "Day 5",
    schedule: "Sheep Ranch replay (AM) · Bandon Crossings (PM)",
    note: "A second look at the bluffs, then a change of scenery with the Tom Doak design 8 miles from the resort.",
  },
  {
    day: "Day 6",
    schedule: "Bandon Dunes (AM) · Depart",
    note: "A final round on the original course, then out. North Bend to PDX is 3 hours if you're flying home.",
  },
];

const lodging = `### The Bunkhouses
**Best for groups of 8–12**
Chrome Lake and Plank House are purpose-built for groups. Each has a full common room, kitchen, and enough beds. Best per-person value on property when you fill them. Book as a house, not by the room.

### The Cottages
**Groups of 4–8**
Standalone units that sleep 4–6 with a sitting room. Best option for groups that want a gathering space between rounds. Multiple configurations; some face the course.

### The Inn at Bandon Dunes
**Smaller groups, couples**
Hotel-style rooms with ocean or course views. Convenient to everything. Lily Pond rooms are the upgrade worth taking.

### The Lodge
**Classic rooms**
Original lodge building above the pro shop. Walking distance to all first tees. Straightforward rooms at a slightly lower rate than the Inn.`;

const dining = `### McKee's Pub
**Nightly default**
Reliably good burgers, fish and chips, local beer on tap. Stays open late. The pub never feels like the wrong choice after a long day on the course.

### The Gallery Restaurant
**One night, worth it**
The fine-dining option on property. Book it for the first night or a group celebration. The kitchen earns the price point.

### The Bunker Bar
**Post-round drinks**
In the Day Lodge at the center of the property. Best patio on-site when weather cooperates. Default stop between the 18th green and the next tee sheet review.

### Trails End
**Lunch between courses**
Adjacent to Bandon Trails. Good for a quick lunch if you're playing back-to-back rounds and don't want to walk to the main lodge.

### Day Lodge
**Breakfast**
Handles breakfast efficiently. Arrive before the morning rush or eat fast.`;

const sideTrips = [
  {
    id: "st1", slug: "bandon-crossings",
    name: "Bandon Crossings",
    isGolf: true,
    consolidatedRanking: 87,
    text: "A Tom Doak design about 8 miles from the resort. Not at the level of the five main courses, but a legitimate round and a different architectural conversation. Worth it for a sixth day or for a group member who wants a break from pure links terrain. Call ahead — availability is limited.",
  },
  {
    id: "st2", slug: "shore-acres",
    name: "Shore Acres State Park",
    isGolf: false,
    text: "Botanical gardens built into the cliffs above the Pacific, 10 minutes from the resort. Worth a walk for non-golfers or between-round recovery. The storm-watch viewpoint is the best on the coast.",
  },
  {
    id: "st3", slug: "cape-arago",
    name: "Cape Arago State Park",
    isGolf: false,
    text: "Sea lions, tide pools, and viewpoints in a compact loop. Good for a 90-minute break. Simpson Reef is the better of the two viewpoints.",
  },
  {
    id: "st4", slug: "coos-bay",
    name: "Coos Bay",
    isGolf: false,
    text: "The largest city on the southern Oregon coast, 25 minutes away. Good for grocery runs, a change of scenery, or a meal if the group wants off-property dining. The Blue Heron Bistro handles dinner well.",
  },
];

export default function DesignTripPage() {
  const slug = trip.slug;
  const heroUrl = `/images/trips/${slug}.jpg`;

  return (
    <main>
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
              <p className={hero.bannerDeck}>{trip.subheader}</p>
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
                  <span className={hero.bannerMetaVal}>{trip.leadTime}</span>
                </div>
                <div className={hero.bannerMetaRow}>
                  <span className={hero.bannerMetaKey}>Cost:</span>
                  <span className={hero.bannerMetaVal}>{formatCostTier(trip.costTier)}</span>
                </div>
              </div>

              <div className={hero.bannerScores}>
                <div className={hero.bannerScoreRow}>
                  <span className={hero.bannerScoreKey}>Golf:</span>
                  <span className={hero.bannerScoreVal}>{Math.floor(trip.golfRating)}</span>
                </div>
                <div className={hero.bannerScoreRow}>
                  <span className={hero.bannerScoreKey}>Lodging:</span>
                  <span className={hero.bannerScoreVal}>{Math.floor(trip.lodgingRating)}</span>
                </div>
                <div className={hero.bannerScoreRow}>
                  <span className={hero.bannerScoreKey}>Food:</span>
                  <span className={hero.bannerScoreVal}>{Math.floor(trip.foodRating)}</span>
                </div>
                <div className={hero.bannerScoreRow}>
                  <span className={hero.bannerScoreKey}>Vibe:</span>
                  <span className={hero.bannerScoreVal}>{Math.floor(trip.vibeRating)}</span>
                </div>
                <div className={hero.bannerScoreRowOverall}>
                  <span className={hero.bannerScoreKey}>Overall:</span>
                  <span className={hero.bannerOverallVal}>{trip.overallRating.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CompareWidget tripName={trip.name} currentSlug={slug} trips={[]} />

      {/* ── BODY LAYOUT: TOC rail + main content ──────────────── */}
      <div className={dt.body}>
        <div className={dt.bodyLayout}>

          {/* LEFT RAIL TOC */}
          <aside className={dt.tocRail}>
            <TocNav />
          </aside>

          {/* MAIN CONTENT */}
          <div className={dt.mainContent}>

            {/* ── VERDICT ────────────────────────────────────────── */}
            <section id="verdict" className={dt.section}>
              <div className={dt.sectionLabel}>Our take</div>
              <p className={dt.verdictText}>{trip.overview}</p>
            </section>

            <hr className={dt.sectionDivider} />

            {/* ── COURSES ────────────────────────────────────────── */}
            <section id="courses" className={dt.section}>
              <div className={dt.sectionLabel}>What you play</div>
              <h2 className={dt.sectionTitle}>Courses included</h2>

              <CourseCarousel courses={courses} />

            </section>

            <hr className={dt.sectionDivider} />

            {/* ── THE EXPERIENCE ──────────────────────────────────── */}
            <section id="experience" className={dt.section}>
              <div className={dt.sectionLabel}>Review</div>
              <h2 className={dt.sectionTitle}>The trip experience</h2>

              <ProseMarkdown content={trip.fullDescription} />

              <ProseMarkdown content={trip.wantMore} />
            </section>

            <hr className={dt.sectionDivider} />

            {/* ── SIDE TRIPS ──────────────────────────────────────── */}
            <section id="side-trips" className={dt.section}>
              <div className={dt.sectionLabel}>While you're there</div>
              <h2 className={dt.sectionTitle}>Side trips &amp; bonus golf</h2>

              <SideTripCarousel items={sideTrips} />
            </section>

            <hr className={dt.sectionDivider} />

            {/* ── IS THIS TRIP RIGHT FOR YOU? ─────────────────────── */}
            <section id="fit" className={dt.section}>
              <div className={dt.sectionLabel}>Fit</div>
              <h2 className={dt.sectionTitle}>Is this trip right for your group?</h2>
              <div className={dt.fitGrid}>
                <div className={`${dt.fitCard} ${dt.fitCardYes}`}>
                  <div className={`${dt.fitCardTitle} ${dt.fitCardTitleYes}`}>Book this trip if…</div>
                  <ul className={dt.fitList}>
                    {groupFitYes.map((item) => (
                      <li key={item} className={dt.fitItem}>
                        <span className={dt.fitIcon}>✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`${dt.fitCard} ${dt.fitCardNo}`}>
                  <div className={`${dt.fitCardTitle} ${dt.fitCardTitleNo}`}>Skip this trip if…</div>
                  <ul className={dt.fitList}>
                    {groupFitNo.map((item) => (
                      <li key={item} className={dt.fitItem}>
                        <span className={dt.fitIcon}>✗</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <hr className={dt.sectionDivider} />

            {/* ── COST ────────────────────────────────────────────── */}
            <section id="cost" className={dt.section}>
              <div className={dt.sectionLabel}>Budget</div>
              <h2 className={dt.sectionTitle}>What a Bandon trip costs</h2>

              <table className={dt.costTable}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Shoulder (May–Jun, Oct)</th>
                    <th>Peak (Jul–Sep)</th>
                  </tr>
                </thead>
                <tbody>
                  {costRows.map((row) => (
                    <tr key={row.line}>
                      <td>
                        {row.line}
                        {row.optional && <span className={dt.costOptional}>(optional)</span>}
                      </td>
                      <td>{row.shoulder}</td>
                      <td>{row.peak}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={dt.costTableTotal}>
                    <td>Total per person</td>
                    <td>$2,500–4,150</td>
                    <td>$4,250–5,600+</td>
                  </tr>
                </tfoot>
              </table>

              <p className={dt.costNote}>
                Per-person estimates for a 5-round, 4-night trip with a group of 4. Shoulder figures exclude caddie. Peak figures assume one caddied round. Airfare to North Bend or Portland not included.
              </p>
            </section>

            <hr className={dt.sectionDivider} />

            {/* ── WHEN TO GO ──────────────────────────────────────── */}
            <section id="when" className={dt.section}>
              <div className={dt.sectionLabel}>Timing</div>
              <h2 className={dt.sectionTitle}>When to go</h2>

              <div className={dt.seasonGrid}>
                <div className={`${dt.seasonCard} ${dt.seasonCardPeak}`}>
                  <div className={`${dt.seasonTagline} ${dt.seasonTaglinePeak}`}>Peak</div>
                  <div className={dt.seasonName}>Summer</div>
                  <div className={dt.seasonMonths}>July – September</div>
                  <ul className={dt.seasonPoints}>
                    {[
                      "Best weather — clearest skies, firmest fairways",
                      "Highest prices across lodging and tee fees",
                      "Tee times require 13-month booking windows",
                      "Worth it if you can secure dates",
                    ].map((pt) => (
                      <li key={pt} className={dt.seasonPoint}>
                        <span className={`${dt.seasonDot} ${dt.seasonDotPeak}`} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <div className={dt.seasonVerdict}>Best for: first-timers who want ideal conditions and can plan far ahead.</div>
                </div>

                <div className={`${dt.seasonCard} ${dt.seasonCardShoulder}`}>
                  <div className={`${dt.seasonTagline} ${dt.seasonTaglineShoulder}`}>Shoulder</div>
                  <div className={dt.seasonName}>Spring &amp; Fall</div>
                  <div className={dt.seasonMonths}>May–June · October</div>
                  <ul className={dt.seasonPoints}>
                    {[
                      "Good weather with more wind variability",
                      "15–25% lower on lodging and tee fees",
                      "Easier booking — 9–12 months usually sufficient",
                      "October adds softer, punchier conditions",
                    ].map((pt) => (
                      <li key={pt} className={dt.seasonPoint}>
                        <span className={`${dt.seasonDot} ${dt.seasonDotShoulder}`} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <div className={dt.seasonVerdict}>Best for: most groups — the smart tradeoff between conditions and cost.</div>
                </div>

                <div className={`${dt.seasonCard} ${dt.seasonCardOff}`}>
                  <div className={`${dt.seasonTagline} ${dt.seasonTaglineOff}`}>Off-Peak</div>
                  <div className={dt.seasonName}>Winter</div>
                  <div className={dt.seasonMonths}>November – April</div>
                  <ul className={dt.seasonPoints}>
                    {[
                      "Dramatically lower rates on all inventory",
                      "Rain is likely; wind is certain",
                      "Courses play fast and firm when dry",
                      "Tee times available within weeks",
                    ].map((pt) => (
                      <li key={pt} className={dt.seasonPoint}>
                        <span className={`${dt.seasonDot} ${dt.seasonDotOff}`} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <div className={dt.seasonVerdict}>Best for: experienced links players who prefer the course over the weather.</div>
                </div>
              </div>
            </section>

            <hr className={dt.sectionDivider} />

            {/* ── TEE TIMES ───────────────────────────────────────── */}
            <section id="tee-times" className={dt.section}>
              <div className={dt.sectionLabel}>Logistics</div>
              <h2 className={dt.sectionTitle}>How tee times and lodging actually work</h2>

              <ol className={dt.numberedList}>
                {teeTimeRules.map((rule, i) => (
                  <li key={rule.head} className={dt.numberedItem}>
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

            {/* ── COMMON MISTAKES ─────────────────────────────────── */}
            <section id="mistakes" className={dt.section}>
              <div className={dt.sectionLabel}>Watch out for</div>
              <h2 className={dt.sectionTitle}>Common mistakes</h2>

              <ul className={dt.mistakeList}>
                {mistakes.map((m) => (
                  <li key={m.head} className={dt.mistakeItem}>
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

            {/* ── PACK LIST ───────────────────────────────────────── */}
            <section id="pack" className={dt.section}>
              <div className={dt.sectionLabel}>Prep</div>
              <h2 className={dt.sectionTitle}>What to pack</h2>

              <div className={dt.packColumns}>
                <div className={dt.packGroup}>
                  <div className={dt.packGroupLabel}>Bring</div>
                  <PackMarkdown content={packBring} variant="bring" />
                </div>
                <div className={dt.packGroup}>
                  <div className={dt.packGroupLabel}>Leave at home</div>
                  <PackMarkdown content={packLeave} variant="leave" />
                </div>
              </div>
            </section>

            <hr className={dt.sectionDivider} />

            {/* ── ITINERARY ───────────────────────────────────────── */}
            <section id="itinerary" className={dt.section}>
              <div className={dt.sectionLabel}>Sample schedule</div>
              <h2 className={dt.sectionTitle}>Sample itinerary</h2>

              <ItineraryToggle
                minItinerary={itinerary4}
                maxItinerary={itinerary6}
                footnote="Most groups play 5–7 total rounds regardless of trip length. Walking all five courses is expected and enforced."
              />
            </section>

            <hr className={dt.sectionDivider} />

            {/* ── STAY & EAT ──────────────────────────────────────── */}
            <section id="stay" className={dt.section}>
              <div className={dt.sectionLabel}>On property</div>
              <h2 className={dt.sectionTitle}>Where to stay &amp; eat</h2>

              <LodgingMarkdown content={lodging} label="Lodging" />

              <LodgingMarkdown content={dining} label="Dining" />
            </section>

            <hr className={dt.sectionDivider} />

            {/* ── PLAN THIS TRIP — hidden ─────────────────────────── */}

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
