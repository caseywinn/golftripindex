import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "../../lib/seo";
import { JsonLd } from "@/components/JsonLd";
import styles from "../../styles/cost-index.module.css";
import CostIndexClient, { type TripCostRow } from "./CostIndexClient";
import { getAllTripsCostSummary } from "../../lib/airtable";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "2026 Golf Trip All-In Cost Index: What Every Destination Actually Costs",
  description:
    "Green fees, lodging, and all-in estimates for all 55 ranked golf trip destinations. Filter by budget tier, sort by cost or GTI ranking.",
  alternates: { canonical: `${SITE_URL}/golf-trip-cost-index` },
};

type EditorialRow = {
  tier: TripCostRow["tier"];
  callout: string;
  greenFees: string;
  lodging: string;
};

const EDITORIAL: Record<string, EditorialRow> = {
  "arcadia-bluffs": {
    tier: "Mid",
    greenFees: "$175–$275",
    lodging: "$150–$350",
    callout: "Lake Michigan bluffs views; September is the sweet spot for rates and conditions.",
  },
  aspen: {
    tier: "Ultra-Premium",
    greenFees: "$100–$200",
    lodging: "$500–$1,000",
    callout: "Lodging is the cost driver. Aspen Golf Club muni is the only public option.",
  },
  "bandon-dunes": {
    tier: "Premium",
    greenFees: "$225–$375",
    lodging: "$190–$510",
    callout: "Five courses; resort guests get priority tee times and lower posted rates.",
  },
  banff: {
    tier: "Premium",
    greenFees: "$120–$165",
    lodging: "$300–$600",
    callout: "USD/CAD exchange gives Americans roughly 25% off listed rates.",
  },
  "bay-harbor": {
    tier: "Mid",
    greenFees: "$80–$160",
    lodging: "$120–$280",
    callout: "Northern Michigan resort golf without the Bandon price tag.",
  },
  "bend-oregon": {
    tier: "Mid",
    greenFees: "$80–$180",
    lodging: "$130–$280",
    callout: "Tetherow, Pronghorn, and Brasada: three strong courses in one weekend.",
  },
  bethpage: {
    tier: "Value",
    greenFees: "$140–$160",
    lodging: "$100–$200",
    callout: "State park pricing on a U.S. Open and Ryder Cup venue. No on-site lodging.",
  },
  "big-cedar-lodge": {
    tier: "Mid",
    greenFees: "$70–$150",
    lodging: "$180–$350",
    callout: "Top of the Rock par-3 course is free with resort stay.",
  },
  biloxi: {
    tier: "Value",
    greenFees: "$60–$150",
    lodging: "$80–$180",
    callout: "Fallen Oak ($150) is world-class. Casino lodging comps can cut costs further.",
  },
  "boston-and-new-england": {
    tier: "Mid",
    greenFees: "$75–$160",
    lodging: "$130–$300",
    callout: "Taconic and The Orchards are the bucket-list plays in this market.",
  },
  broadmoor: {
    tier: "Premium",
    greenFees: "$220–$300",
    lodging: "$350–$550",
    callout: "Forbes Five-Star resort. Best course-to-cost ratio in Colorado Springs.",
  },
  "cabot-cape-breton": {
    tier: "Premium",
    greenFees: "$270–$370",
    lodging: "$300–$500",
    callout: "Cabot Cliffs is consistently ranked top 5 public courses in the world.",
  },
  "cabot-citrus-farms": {
    tier: "Premium",
    greenFees: "$137–$350",
    lodging: "$250–$800",
    callout: "Camp Cabot Package ($2,500/person, 2 nights + 2 rounds) is the cleanest entry point.",
  },
  "coeur-dalene": {
    tier: "Mid",
    greenFees: "$150–$240",
    lodging: "$120–$250",
    callout: "Floating island green. Forecaddie included in the green fee.",
  },
  dallas: {
    tier: "Mid",
    greenFees: "$100–$280",
    lodging: "$130–$300",
    callout: "Omni PGA Frisco is the new anchor. Four courses on one campus.",
  },
  "eastern-nebraska": {
    tier: "Value",
    greenFees: "$42–$80",
    lodging: "$70–$130",
    callout: "Quarry Oaks is a top-50 public course at $65 with cart.",
  },
  "french-lick": {
    tier: "Mid-High",
    greenFees: "$200–$500",
    lodging: "$170–$350",
    callout: "Pete Dye Course ($400+) requires a mandatory $50 forecaddie. Donald Ross ($200) is the value anchor.",
  },
  "gamble-sands": {
    tier: "Mid-High",
    greenFees: "$200–$295",
    lodging: "$250–$450",
    callout: "Same-day replay for $100 makes this the best replay deal in destination golf.",
  },
  "giants-ridge": {
    tier: "Value",
    greenFees: "$90–$130",
    lodging: "$80–$200",
    callout: "Two championship courses. 36-hole weekday packages from $210.",
  },
  "golden-horseshoe": {
    tier: "Mid",
    greenFees: "$99–$180",
    lodging: "$100–$220",
    callout: "Pete Dye-designed Gold Course inside Colonial Williamsburg.",
  },
  "hilton-head": {
    tier: "Mid-High",
    greenFees: "$80–$480",
    lodging: "$120–$400",
    callout: "Harbour Town ($480) vs. municipal courses ($80). October is the sweet spot for rates.",
  },
  innisbrook: {
    tier: "Mid-High",
    greenFees: "$200–$350",
    lodging: "$180–$300",
    callout: "Copperhead (Valspar Championship host) is the must-play. Four-course variety.",
  },
  "kiawah-island": {
    tier: "Premium",
    greenFees: "$240–$350",
    lodging: "$250–$600",
    callout: "Ocean Course is walking-only in the mornings. Caddie gratuity (~$120/bag) is a real line item.",
  },
  "lake-tahoe": {
    tier: "Premium",
    greenFees: "$275–$450",
    lodging: "$220–$500",
    callout: "Edgewood peaks at $450/round (Jul–Sep). Old Greenwood is the smart value play.",
  },
  "lajitas-tx": {
    tier: "Mid-High",
    greenFees: "$175",
    lodging: "$220–$280",
    callout: "Must stay on-resort for the $175 rate. Non-guests pay $275. Big Bend views included.",
  },
  "las-vegas": {
    tier: "Mid",
    greenFees: "$65–$200",
    lodging: "$60–$350",
    callout: "Skip Shadow Creek ($1,250). Cascata, Bear's Best, and TPC Las Vegas is the smart play.",
  },
  mclemore: {
    tier: "Mid-High",
    greenFees: "$150–$250",
    lodging: "$250–$450",
    callout: "Cloudland Hotel (Curio by Hilton) opened 2024. Stay-and-play only.",
  },
  "myrtle-beach": {
    tier: "Value",
    greenFees: "$50–$150",
    lodging: "$50–$200",
    callout: "Best pure golf value in the US. 100+ courses. Mid-range trip ($700–$1,000) is the sweet spot.",
  },
  napa: {
    tier: "Mid-High",
    greenFees: "$40–$200",
    lodging: "$180–$450",
    callout: "Silverado Resort anchors the golf. Wine budget can match the golf budget.",
  },
  "new-mexico": {
    tier: "Mid",
    greenFees: "$40–$225",
    lodging: "$100–$280",
    callout: "Paa-Ko Ridge ($225) is the No. 1 course in-state. Marty Sanchez Links is the top value.",
  },
  "north-dakota": {
    tier: "Value",
    greenFees: "$97–$147",
    lodging: "$80–$180",
    callout: "Bully Pulpit is bucket-list Badlands golf. $225 covers 3 North Dakota courses.",
  },
  "omni-barton-creek": {
    tier: "Mid-High",
    greenFees: "$180–$280",
    lodging: "$250–$450",
    callout: "Coore/Crenshaw course is the must-play. Four courses for a 4-day group trip.",
  },
  "omni-homestead": {
    tier: "Mid-High",
    greenFees: "$200–$320",
    lodging: "$200–$350",
    callout: "The Cascades (William Flynn) is a top-50 historic course. Old Course at $203 is the deal.",
  },
  "palm-springs": {
    tier: "Mid-High",
    greenFees: "$85–$200",
    lodging: "$120–$400",
    callout: "Peak season Dec–Apr. May or October is the sweet spot. PGA West Stadium ($264) is marquee.",
  },
  "pebble-beach": {
    tier: "Ultra-Premium",
    greenFees: "$550–$695",
    lodging: "$800–$1,300",
    callout: "2 resort nights required for advance Pebble tee time. Spyglass ($550) is the worthy alternative.",
  },
  "pinehurst-area": {
    tier: "Mid",
    greenFees: "$120–$315",
    lodging: "$90–$250",
    callout: "Pine Needles, Mid Pines, and Tobacco Road deliver Pinehurst magic without the resort markup.",
  },
  "pinehurst-resort": {
    tier: "Premium",
    greenFees: "$300–$470",
    lodging: "$200–$450",
    callout: "No. 2 requires a 2-night minimum plus a $250 surcharge on top of the package rate.",
  },
  "reynolds-lake-oconee": {
    tier: "Mid-High",
    greenFees: "$245–$400",
    lodging: "$250–$500",
    callout: "Stay-and-play only. Six courses across Nicklaus, Fazio, and Rees Jones designs.",
  },
  roscommon: {
    tier: "Mid",
    greenFees: "$80–$170",
    lodging: "$80–$220",
    callout: "Forest Dunes (The Loop) is a world-class reversible course. Northern Michigan budget lodging.",
  },
  "rtj-trail": {
    tier: "Value",
    greenFees: "$40–$100",
    lodging: "$80–$180",
    callout: "468 holes across 11 sites. Grand National package ($240/day) is the best starting point.",
  },
  "san-diego": {
    tier: "Mid-High",
    greenFees: "$163–$322",
    lodging: "$150–$450",
    callout: "Torrey Pines adds a $50 booking fee + $60 service fee per player. Lodge at Torrey is the splurge.",
  },
  "sand-valley": {
    tier: "Premium",
    greenFees: "$325",
    lodging: "$350–$700",
    callout: "On-resort packages: $4,000–$6,000. Off-site a-la-carte: ~$1,500. Availability is an extreme challenge.",
  },
  "santa-barbara": {
    tier: "Mid-High",
    greenFees: "$170–$240",
    lodging: "$180–$380",
    callout: "Sandpiper is oceanfront world-class golf. Pair it with wine country.",
  },
  sawgrass: {
    tier: "Premium",
    greenFees: "$550–$775",
    lodging: "$200–$400",
    callout: "Dye's Duo Package ($1,732) is the best entry point. Forecaddie gratuity is not included.",
  },
  scottsdale: {
    tier: "Mid-High",
    greenFees: "$100–$550",
    lodging: "$150–$600",
    callout: "TPC Stadium ($436–$550) is the name brand. Troon North ($250–$315) is the better round.",
  },
  "sea-island": {
    tier: "Premium",
    greenFees: "$245–$350",
    lodging: "$250–$500",
    callout: "RSM Classic host. Forecaddie included. Three-night minimum for package rates.",
  },
  "silvies-ranch": {
    tier: "Mid-High",
    greenFees: "$220",
    lodging: "$200–$400",
    callout: "Reversible 18-hole courses. Goat caddies. Most unique golf experience in America.",
  },
  "southern-utah": {
    tier: "Mid",
    greenFees: "$75–$175",
    lodging: "$50–$300",
    callout: "Black Desert (PGA TOUR host) + Sand Hollow + Entrada. Value season: Sep–Nov.",
  },
  streamsong: {
    tier: "Premium",
    greenFees: "$150–$375",
    lodging: "$250–$500",
    callout: "Three Top-30 US courses at one property. Summer rates ($150/round) make it most affordable.",
  },
  "the-greenbrier": {
    tier: "Premium",
    greenFees: "$200–$355",
    lodging: "$280–$500",
    callout: "$49/day resort fee plus Historic Preservation Fund. Old White and Meadows are unlimited in packages.",
  },
  treetops: {
    tier: "Value",
    greenFees: "$50–$120",
    lodging: "$80–$180",
    callout: "Five courses on-property. 2 nights + 2 rounds from $499 total for two. Best value resort in the Midwest.",
  },
  tucson: {
    tier: "Mid",
    greenFees: "$70–$175",
    lodging: "$100–$250",
    callout: "Ventana Canyon (Fazio) + Starr Pass (Palmer) is the top combo. Summer rates drop 50%.",
  },
  "turning-stone": {
    tier: "Mid-High",
    greenFees: "$225–$275",
    lodging: "$120–$300",
    callout: "Atunyote (Fazio) + Shenendoah + Kaluhyat. Casino entertainment is the bonus.",
  },
  "western-nebraska": {
    tier: "Value",
    greenFees: "$30–$75",
    lodging: "$50–$130",
    callout: "Golf The West packages from $285 (3 nights + 3 rounds total). Sandhills scenery rivals the courses.",
  },
  "whistling-straits": {
    tier: "Premium",
    greenFees: "$200–$400",
    lodging: "$280–$600",
    callout: "Straits Course is walking-only. Caddie ($90) + tip ($70) per bag. American Club is the Midwest's only AAA Five Diamond resort.",
  },
};

function fmtAllIn(low: number, high: number): string {
  if (low === 0 && high === 0) return "N/A";
  const fmt = (n: number) => `$${n.toLocaleString()}`;
  return low === high ? fmt(low) : `${fmt(low)}–${fmt(high)}`;
}

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Articles", item: `${SITE_URL}/articles` },
    {
      "@type": "ListItem",
      position: 3,
      name: "2026 Golf Trip Cost Index",
      item: `${SITE_URL}/golf-trip-cost-index`,
    },
  ],
};

const datasetSchema = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "2026 Golf Trip All-In Cost Index",
  description:
    "Green fees, lodging costs, and all-in estimates for 55 ranked US golf trip destinations, with tier classification and per-destination callouts.",
  url: `${SITE_URL}/golf-trip-cost-index`,
  creator: { "@type": "Organization", name: "Golf Trip Index", url: SITE_URL },
  dateModified: "2026-05-01",
  variableMeasured: ["Green fees per round", "Lodging per night", "All-in cost per 3-day trip"],
};

export default async function CostIndexPage() {
  const summaries = await getAllTripsCostSummary();

  const trips: TripCostRow[] = summaries
    .map((s): TripCostRow | null => {
      const ed = EDITORIAL[s.slug];
      if (!ed) return null;
      return {
        slug: s.slug,
        name: s.name,
        state: s.state ?? "",
        greenFees: ed.greenFees,
        lodging: ed.lodging,
        allIn: fmtAllIn(s.allInLow, s.allInHigh),
        allInLow: s.allInLow,
        allInHigh: s.allInHigh,
        tier: ed.tier,
        callout: ed.callout,
        ranking: s.currentRanking,
      };
    })
    .filter((t): t is TripCostRow => t !== null)
    .sort((a, b) => (a.ranking ?? 999) - (b.ranking ?? 999));

  const withCosts = trips.filter((t) => t.allInLow > 0);
  const sortedByLow = [...withCosts].sort((a, b) => a.allInLow - b.allInLow);
  const sortedByHigh = [...withCosts].sort((a, b) => b.allInHigh - a.allInHigh);
  const cheapest = sortedByLow[0];
  const priciest = sortedByHigh[0];
  const median = sortedByLow[Math.floor(sortedByLow.length / 2)];

  const valueCount = trips.filter((t) => t.tier === "Value").length;
  const premiumCount = trips.filter((t) => t.tier === "Premium" || t.tier === "Ultra-Premium").length;

  return (
    <main className={styles.page}>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={datasetSchema} />

      <div className={styles.pageHeader}>
        <p className={styles.pageBack}>
          <Link href="/articles">← Articles</Link>
        </p>
        <p className={styles.eyebrow}>2026 Data</p>
        <h1 className={styles.pageTitle}>Golf Trip All-In Cost Index</h1>
        <p className={styles.pageSubtitle}>
          What every ranked golf destination actually costs: green fees, lodging, and a realistic
          all-in estimate for a 3-day group trip. All {trips.length} GTI-ranked destinations, one table.
        </p>
        <div className={styles.metaRow}>
          <span className={styles.metaItem}><strong>{trips.length}</strong> destinations</span>
          <span className={styles.metaItem}><strong>5</strong> cost tiers</span>
          <span className={styles.metaItem}><strong>Updated:</strong> May 2026</span>
          <span className={styles.metaItem}><strong>Methodology:</strong> posted rates + packages, not advertised minimums</span>
        </div>
      </div>

      {withCosts.length > 0 && (
        <div className={styles.insights}>
          <h2 className={styles.insightsTitle}>By the numbers</h2>
          <div className={styles.insightCards}>
            {cheapest && (
              <div className={styles.insightCard}>
                <p className={styles.insightCardLabel}>Cheapest all-in</p>
                <p className={styles.insightCardValue}>{fmtAllIn(cheapest.allInLow, cheapest.allInLow)}</p>
                <p className={styles.insightCardDesc}>
                  {cheapest.name}: shoulder-season estimate for a 3-day trip,
                  summed across all non-optional cost categories.
                </p>
              </div>
            )}
            {priciest && (
              <div className={styles.insightCard}>
                <p className={styles.insightCardLabel}>Most expensive</p>
                <p className={styles.insightCardValue}>{fmtAllIn(priciest.allInHigh, priciest.allInHigh)}</p>
                <p className={styles.insightCardDesc}>
                  {priciest.name} tops the list at peak-season rates across all cost categories.
                </p>
              </div>
            )}
            {median && (
              <div className={styles.insightCard}>
                <p className={styles.insightCardLabel}>Median all-in (shoulder)</p>
                <p className={styles.insightCardValue}>{fmtAllIn(median.allInLow, median.allInLow)}</p>
                <p className={styles.insightCardDesc}>
                  Half the ranked destinations come in under this mark in shoulder season,
                  including several top-20 GTI finishers.
                </p>
              </div>
            )}
            <div className={styles.insightCard}>
              <p className={styles.insightCardLabel}>Value-tier destinations</p>
              <p className={styles.insightCardValue}>{valueCount}</p>
              <p className={styles.insightCardDesc}>
                Under $1,100 all-in for 3 days, with at least one legitimate bucket-list
                course in the rotation.
              </p>
            </div>
            <div className={styles.insightCard}>
              <p className={styles.insightCardLabel}>Premium or better</p>
              <p className={styles.insightCardValue}>{premiumCount}</p>
              <p className={styles.insightCardDesc}>
                Destinations where $1,800+ is the realistic floor. Most require
                resort stays or have mandatory caddie fees.
              </p>
            </div>
            <div className={styles.insightCard}>
              <p className={styles.insightCardLabel}>Best cost-to-rank ratio</p>
              <p className={styles.insightCardValue}>Bethpage</p>
              <p className={styles.insightCardDesc}>
                GTI top-20 for under $1,050 all-in. State park pricing on a U.S. Open
                and Ryder Cup venue.
              </p>
            </div>
          </div>
        </div>
      )}

      <CostIndexClient trips={trips} />

      <div className={styles.methodology}>
        <h2 className={styles.methodologyTitle}>How we built this</h2>
        <p className={styles.methodologyText}>
          All-in estimates are computed directly from GTI&apos;s cost data: we sum the low end of each
          destination&apos;s shoulder-season line items for the floor, and the high end of each
          destination&apos;s peak-season line items for the ceiling. Non-optional costs only.
          Green fee ranges reflect the lowest available weekday rate and peak weekend rate at the
          primary course(s). Lodging ranges use the most common accommodation type for a golf
          group. Estimates are per-person and assume a group of four sharing lodging costs.
          Flights, food, caddie gratuities, and resort fees are excluded unless noted in the
          callout.
        </p>
      </div>
    </main>
  );
}
