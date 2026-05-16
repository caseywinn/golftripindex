import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "../../lib/seo";
import { JsonLd } from "@/components/JsonLd";
import styles from "../../styles/cost-index.module.css";
import CostIndexClient, { type TripCostRow } from "./CostIndexClient";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "2026 Golf Trip All-In Cost Index: What Every Destination Actually Costs",
  description:
    "Green fees, lodging, and all-in estimates for all 55 ranked golf trip destinations. Filter by budget tier, sort by cost or GTI ranking.",
  alternates: { canonical: `${SITE_URL}/golf-trip-cost-index` },
};

const TRIPS: TripCostRow[] = [
  {
    slug: "arcadia-bluffs",
    name: "Arcadia Bluffs",
    state: "Michigan",
    greenFees: "$175–$275",
    lodging: "$150–$350",
    allIn: "$1,100–$1,600",
    allInLow: 1100,
    tier: "Mid",
    ranking: 25,
    callout: "Lake Michigan bluffs views; September is the sweet spot for rates and conditions.",
  },
  {
    slug: "aspen",
    name: "Aspen",
    state: "Colorado",
    greenFees: "$100–$200",
    lodging: "$500–$1,000",
    allIn: "$2,500–$4,500",
    allInLow: 2500,
    tier: "Ultra-Premium",
    ranking: 50,
    callout: "Lodging is the cost driver. Aspen Golf Club muni is the only public option.",
  },
  {
    slug: "bandon-dunes",
    name: "Bandon Dunes",
    state: "Oregon",
    greenFees: "$225–$375",
    lodging: "$190–$510",
    allIn: "$1,800–$2,900",
    allInLow: 1800,
    tier: "Premium",
    ranking: 3,
    callout: "Five courses; resort guests get priority tee times and lower posted rates.",
  },
  {
    slug: "banff",
    name: "Banff",
    state: "Alberta, Canada",
    greenFees: "$120–$165",
    lodging: "$300–$600",
    allIn: "$1,600–$2,700",
    allInLow: 1600,
    tier: "Premium",
    ranking: 22,
    callout: "USD/CAD exchange gives Americans roughly 25% off listed rates.",
  },
  {
    slug: "bay-harbor",
    name: "Bay Harbor",
    state: "Michigan",
    greenFees: "$80–$160",
    lodging: "$120–$280",
    allIn: "$750–$1,400",
    allInLow: 750,
    tier: "Mid",
    ranking: 36,
    callout: "Northern Michigan resort golf without the Bandon price tag.",
  },
  {
    slug: "bend-oregon",
    name: "Bend",
    state: "Oregon",
    greenFees: "$80–$180",
    lodging: "$130–$280",
    allIn: "$800–$1,500",
    allInLow: 800,
    tier: "Mid",
    ranking: 32,
    callout: "Tetherow, Pronghorn, and Brasada: three strong courses in one weekend.",
  },
  {
    slug: "bethpage",
    name: "Bethpage",
    state: "New York",
    greenFees: "$140–$160",
    lodging: "$100–$200",
    allIn: "$650–$1,050",
    allInLow: 650,
    tier: "Value",
    ranking: 18,
    callout: "State park pricing on a U.S. Open and Ryder Cup venue. No on-site lodging.",
  },
  {
    slug: "big-cedar-lodge",
    name: "Big Cedar Lodge",
    state: "Missouri",
    greenFees: "$70–$150",
    lodging: "$180–$350",
    allIn: "$750–$1,400",
    allInLow: 750,
    tier: "Mid",
    ranking: 40,
    callout: "Top of the Rock par-3 course is free with resort stay.",
  },
  {
    slug: "biloxi",
    name: "Biloxi",
    state: "Mississippi",
    greenFees: "$60–$150",
    lodging: "$80–$180",
    allIn: "$550–$1,100",
    allInLow: 550,
    tier: "Value",
    ranking: 44,
    callout: "Fallen Oak ($150) is world-class. Casino lodging comps can cut costs further.",
  },
  {
    slug: "boston-and-new-england",
    name: "Boston & New England",
    state: "Massachusetts",
    greenFees: "$75–$160",
    lodging: "$130–$300",
    allIn: "$800–$1,600",
    allInLow: 800,
    tier: "Mid",
    ranking: 38,
    callout: "Taconic and The Orchards are the bucket-list plays in this market.",
  },
  {
    slug: "broadmoor",
    name: "Broadmoor",
    state: "Colorado",
    greenFees: "$220–$300",
    lodging: "$350–$550",
    allIn: "$1,700–$2,400",
    allInLow: 1700,
    tier: "Premium",
    ranking: 19,
    callout: "Forbes Five-Star resort. Best course-to-cost ratio in Colorado Springs.",
  },
  {
    slug: "cabot-cape-breton",
    name: "Cabot Cape Breton",
    state: "Nova Scotia, Canada",
    greenFees: "$270–$370",
    lodging: "$300–$500",
    allIn: "$1,900–$3,000",
    allInLow: 1900,
    tier: "Premium",
    ranking: 5,
    callout: "Cabot Cliffs is consistently ranked top 5 public courses in the world.",
  },
  {
    slug: "cabot-citrus-farms",
    name: "Cabot Citrus Farms",
    state: "Florida",
    greenFees: "$137–$350",
    lodging: "$250–$800",
    allIn: "$1,500–$2,800",
    allInLow: 1500,
    tier: "Premium",
    ranking: 12,
    callout: "Camp Cabot Package ($2,500/person, 2 nights + 2 rounds) is the cleanest entry point.",
  },
  {
    slug: "coeur-dalene",
    name: "Coeur d'Alene",
    state: "Idaho",
    greenFees: "$150–$240",
    lodging: "$120–$250",
    allIn: "$950–$1,600",
    allInLow: 950,
    tier: "Mid",
    ranking: 30,
    callout: "Floating island green. Forecaddie included in the green fee.",
  },
  {
    slug: "dallas",
    name: "Dallas / Frisco",
    state: "Texas",
    greenFees: "$100–$280",
    lodging: "$130–$300",
    allIn: "$750–$1,500",
    allInLow: 750,
    tier: "Mid",
    ranking: 42,
    callout: "Omni PGA Frisco is the new anchor. Four courses on one campus.",
  },
  {
    slug: "eastern-nebraska",
    name: "Eastern Nebraska",
    state: "Nebraska",
    greenFees: "$42–$80",
    lodging: "$70–$130",
    allIn: "$300–$650",
    allInLow: 300,
    tier: "Value",
    ranking: 52,
    callout: "Quarry Oaks is a top-50 public course at $65 with cart.",
  },
  {
    slug: "french-lick",
    name: "French Lick",
    state: "Indiana",
    greenFees: "$200–$500",
    lodging: "$170–$350",
    allIn: "$1,100–$1,900",
    allInLow: 1100,
    tier: "Mid-High",
    ranking: 27,
    callout: "Pete Dye Course ($400+) requires a mandatory $50 forecaddie. Donald Ross ($200) is the value anchor.",
  },
  {
    slug: "gamble-sands",
    name: "Gamble Sands",
    state: "Washington",
    greenFees: "$200–$295",
    lodging: "$250–$450",
    allIn: "$1,300–$1,900",
    allInLow: 1300,
    tier: "Mid-High",
    ranking: 21,
    callout: "Same-day replay for $100 makes this the best replay deal in destination golf.",
  },
  {
    slug: "giants-ridge",
    name: "Giants Ridge",
    state: "Minnesota",
    greenFees: "$90–$130",
    lodging: "$80–$200",
    allIn: "$550–$900",
    allInLow: 550,
    tier: "Value",
    ranking: 46,
    callout: "Two championship courses. 36-hole weekday packages from $210.",
  },
  {
    slug: "golden-horseshoe",
    name: "Golden Horseshoe",
    state: "Virginia",
    greenFees: "$99–$180",
    lodging: "$100–$220",
    allIn: "$650–$1,250",
    allInLow: 650,
    tier: "Mid",
    ranking: 41,
    callout: "Pete Dye-designed Gold Course inside Colonial Williamsburg.",
  },
  {
    slug: "hilton-head",
    name: "Hilton Head",
    state: "South Carolina",
    greenFees: "$80–$480",
    lodging: "$120–$400",
    allIn: "$800–$2,300",
    allInLow: 800,
    tier: "Mid-High",
    ranking: 16,
    callout: "Harbour Town ($480) vs. municipal courses ($80). October is the sweet spot for rates.",
  },
  {
    slug: "innisbrook",
    name: "Innisbrook",
    state: "Florida",
    greenFees: "$200–$350",
    lodging: "$180–$300",
    allIn: "$1,100–$1,800",
    allInLow: 1100,
    tier: "Mid-High",
    ranking: 23,
    callout: "Copperhead (Valspar Championship host) is the must-play. Four-course variety.",
  },
  {
    slug: "kiawah-island",
    name: "Kiawah Island",
    state: "South Carolina",
    greenFees: "$240–$350",
    lodging: "$250–$600",
    allIn: "$1,700–$3,000",
    allInLow: 1700,
    tier: "Premium",
    ranking: 7,
    callout: "Ocean Course is walking-only in the mornings. Caddie gratuity (~$120/bag) is a real line item.",
  },
  {
    slug: "lake-tahoe",
    name: "Lake Tahoe",
    state: "California",
    greenFees: "$275–$450",
    lodging: "$220–$500",
    allIn: "$1,500–$2,600",
    allInLow: 1500,
    tier: "Premium",
    ranking: 24,
    callout: "Edgewood peaks at $450/round (Jul–Sep). Old Greenwood is the smart value play.",
  },
  {
    slug: "lajitas-tx",
    name: "Lajitas",
    state: "Texas",
    greenFees: "$175",
    lodging: "$220–$280",
    allIn: "$950–$1,400",
    allInLow: 950,
    tier: "Mid-High",
    ranking: 34,
    callout: "Must stay on-resort for the $175 rate. Non-guests pay $275. Big Bend views included.",
  },
  {
    slug: "las-vegas",
    name: "Las Vegas",
    state: "Nevada",
    greenFees: "$65–$200",
    lodging: "$60–$350",
    allIn: "$700–$1,800",
    allInLow: 700,
    tier: "Mid",
    ranking: 35,
    callout: "Skip Shadow Creek ($1,250). Cascata, Bear's Best, and TPC Las Vegas is the smart play.",
  },
  {
    slug: "mclemore",
    name: "McLemore",
    state: "Georgia",
    greenFees: "$150–$250",
    lodging: "$250–$450",
    allIn: "$1,200–$1,900",
    allInLow: 1200,
    tier: "Mid-High",
    ranking: 26,
    callout: "Cloudland Hotel (Curio by Hilton) opened 2024. Stay-and-play only.",
  },
  {
    slug: "myrtle-beach",
    name: "Myrtle Beach",
    state: "South Carolina",
    greenFees: "$50–$150",
    lodging: "$50–$200",
    allIn: "$450–$1,100",
    allInLow: 450,
    tier: "Value",
    ranking: 14,
    callout: "Best pure golf value in the US. 100+ courses. Mid-range trip ($700–$1,000) is the sweet spot.",
  },
  {
    slug: "napa",
    name: "Napa Valley",
    state: "California",
    greenFees: "$40–$200",
    lodging: "$180–$450",
    allIn: "$1,100–$1,900",
    allInLow: 1100,
    tier: "Mid-High",
    ranking: 31,
    callout: "Silverado Resort anchors the golf. Wine budget can match the golf budget.",
  },
  {
    slug: "new-mexico",
    name: "New Mexico",
    state: "New Mexico",
    greenFees: "$40–$225",
    lodging: "$100–$280",
    allIn: "$650–$1,400",
    allInLow: 650,
    tier: "Mid",
    ranking: 48,
    callout: "Paa-Ko Ridge ($225) is the No. 1 course in-state. Marty Sanchez Links is the top value.",
  },
  {
    slug: "north-dakota",
    name: "North Dakota",
    state: "North Dakota",
    greenFees: "$97–$147",
    lodging: "$80–$180",
    allIn: "$450–$800",
    allInLow: 450,
    tier: "Value",
    ranking: 53,
    callout: "Bully Pulpit is bucket-list Badlands golf. $225 covers 3 North Dakota courses.",
  },
  {
    slug: "omni-barton-creek",
    name: "Omni Barton Creek",
    state: "Texas",
    greenFees: "$180–$280",
    lodging: "$250–$450",
    allIn: "$1,400–$2,100",
    allInLow: 1400,
    tier: "Mid-High",
    ranking: 20,
    callout: "Coore/Crenshaw course is the must-play. Four courses for a 4-day group trip.",
  },
  {
    slug: "omni-homestead",
    name: "Omni Homestead",
    state: "Virginia",
    greenFees: "$200–$320",
    lodging: "$200–$350",
    allIn: "$1,200–$1,900",
    allInLow: 1200,
    tier: "Mid-High",
    ranking: 29,
    callout: "The Cascades (William Flynn) is a top-50 historic course. Old Course at $203 is the deal.",
  },
  {
    slug: "palm-springs",
    name: "Palm Springs",
    state: "California",
    greenFees: "$85–$200",
    lodging: "$120–$400",
    allIn: "$750–$2,000",
    allInLow: 750,
    tier: "Mid-High",
    ranking: 28,
    callout: "Peak season Dec–Apr. May or October is the sweet spot. PGA West Stadium ($264) is marquee.",
  },
  {
    slug: "pebble-beach",
    name: "Pebble Beach",
    state: "California",
    greenFees: "$550–$695",
    lodging: "$800–$1,300",
    allIn: "$3,000–$4,200",
    allInLow: 3000,
    tier: "Ultra-Premium",
    ranking: 1,
    callout: "2 resort nights required for advance Pebble tee time. Spyglass ($550) is the worthy alternative.",
  },
  {
    slug: "pinehurst-area",
    name: "Pinehurst Area",
    state: "North Carolina",
    greenFees: "$120–$315",
    lodging: "$90–$250",
    allIn: "$850–$1,700",
    allInLow: 850,
    tier: "Mid",
    ranking: 15,
    callout: "Pine Needles, Mid Pines, and Tobacco Road deliver Pinehurst magic without the resort markup.",
  },
  {
    slug: "pinehurst-resort",
    name: "Pinehurst Resort",
    state: "North Carolina",
    greenFees: "$300–$470",
    lodging: "$200–$450",
    allIn: "$1,800–$3,500",
    allInLow: 1800,
    tier: "Premium",
    ranking: 6,
    callout: "No. 2 requires a 2-night minimum plus a $250 surcharge on top of the package rate.",
  },
  {
    slug: "reynolds-lake-oconee",
    name: "Reynolds Lake Oconee",
    state: "Georgia",
    greenFees: "$245–$400",
    lodging: "$250–$500",
    allIn: "$1,400–$2,400",
    allInLow: 1400,
    tier: "Mid-High",
    ranking: 17,
    callout: "Stay-and-play only. Six courses across Nicklaus, Fazio, and Rees Jones designs.",
  },
  {
    slug: "roscommon",
    name: "Roscommon",
    state: "Michigan",
    greenFees: "$80–$170",
    lodging: "$80–$220",
    allIn: "$650–$1,200",
    allInLow: 650,
    tier: "Mid",
    ranking: 37,
    callout: "Forest Dunes (The Loop) is a world-class reversible course. Northern Michigan budget lodging.",
  },
  {
    slug: "rtj-trail",
    name: "RTJ Golf Trail",
    state: "Alabama",
    greenFees: "$40–$100",
    lodging: "$80–$180",
    allIn: "$400–$800",
    allInLow: 400,
    tier: "Value",
    ranking: 43,
    callout: "468 holes across 11 sites. Grand National package ($240/day) is the best starting point.",
  },
  {
    slug: "san-diego",
    name: "San Diego",
    state: "California",
    greenFees: "$163–$322",
    lodging: "$150–$450",
    allIn: "$1,100–$2,200",
    allInLow: 1100,
    tier: "Mid-High",
    ranking: 13,
    callout: "Torrey Pines adds a $50 booking fee + $60 service fee per player. Lodge at Torrey is the splurge.",
  },
  {
    slug: "sand-valley",
    name: "Sand Valley",
    state: "Wisconsin",
    greenFees: "$325",
    lodging: "$350–$700",
    allIn: "$1,500–$5,000",
    allInLow: 1500,
    tier: "Premium",
    ranking: 4,
    callout: "On-resort packages: $4,000–$6,000. Off-site a-la-carte: ~$1,500. Availability is an extreme challenge.",
  },
  {
    slug: "santa-barbara",
    name: "Santa Barbara",
    state: "California",
    greenFees: "$170–$240",
    lodging: "$180–$380",
    allIn: "$1,100–$2,000",
    allInLow: 1100,
    tier: "Mid-High",
    ranking: 33,
    callout: "Sandpiper is oceanfront world-class golf. Pair it with wine country.",
  },
  {
    slug: "sawgrass",
    name: "Sawgrass",
    state: "Florida",
    greenFees: "$550–$775",
    lodging: "$200–$400",
    allIn: "$1,600–$2,300",
    allInLow: 1600,
    tier: "Premium",
    ranking: 9,
    callout: "Dye's Duo Package ($1,732) is the best entry point. Forecaddie gratuity is not included.",
  },
  {
    slug: "scottsdale",
    name: "Scottsdale",
    state: "Arizona",
    greenFees: "$100–$550",
    lodging: "$150–$600",
    allIn: "$900–$2,500",
    allInLow: 900,
    tier: "Mid-High",
    ranking: 8,
    callout: "TPC Stadium ($436–$550) is the name brand. Troon North ($250–$315) is the better round.",
  },
  {
    slug: "sea-island",
    name: "Sea Island",
    state: "Georgia",
    greenFees: "$245–$350",
    lodging: "$250–$500",
    allIn: "$1,700–$2,600",
    allInLow: 1700,
    tier: "Premium",
    ranking: 10,
    callout: "RSM Classic host. Forecaddie included. Three-night minimum for package rates.",
  },
  {
    slug: "silvies-ranch",
    name: "Silvies Ranch",
    state: "Oregon",
    greenFees: "$220",
    lodging: "$200–$400",
    allIn: "$1,100–$1,800",
    allInLow: 1100,
    tier: "Mid-High",
    ranking: 39,
    callout: "Reversible 18-hole courses. Goat caddies. Most unique golf experience in America.",
  },
  {
    slug: "southern-utah",
    name: "Southern Utah",
    state: "Utah",
    greenFees: "$75–$175",
    lodging: "$50–$300",
    allIn: "$550–$1,500",
    allInLow: 550,
    tier: "Mid",
    ranking: 45,
    callout: "Black Desert (PGA TOUR host) + Sand Hollow + Entrada. Value season: Sep–Nov.",
  },
  {
    slug: "streamsong",
    name: "Streamsong",
    state: "Florida",
    greenFees: "$150–$375",
    lodging: "$250–$500",
    allIn: "$1,500–$2,400",
    allInLow: 1500,
    tier: "Premium",
    ranking: 11,
    callout: "Three Top-30 US courses at one property. Summer rates ($150/round) make it most affordable.",
  },
  {
    slug: "the-greenbrier",
    name: "The Greenbrier",
    state: "West Virginia",
    greenFees: "$200–$355",
    lodging: "$280–$500",
    allIn: "$1,600–$2,500",
    allInLow: 1600,
    tier: "Premium",
    ranking: 20,
    callout: "$49/day resort fee plus Historic Preservation Fund. Old White and Meadows are unlimited in packages.",
  },
  {
    slug: "treetops",
    name: "Treetops",
    state: "Michigan",
    greenFees: "$50–$120",
    lodging: "$80–$180",
    allIn: "$500–$1,000",
    allInLow: 500,
    tier: "Value",
    ranking: 47,
    callout: "Five courses on-property. 2 nights + 2 rounds from $499 total for two. Best value resort in the Midwest.",
  },
  {
    slug: "tucson",
    name: "Tucson",
    state: "Arizona",
    greenFees: "$70–$175",
    lodging: "$100–$250",
    allIn: "$700–$1,400",
    allInLow: 700,
    tier: "Mid",
    ranking: 49,
    callout: "Ventana Canyon (Fazio) + Starr Pass (Palmer) is the top combo. Summer rates drop 50%.",
  },
  {
    slug: "turning-stone",
    name: "Turning Stone",
    state: "New York",
    greenFees: "$225–$275",
    lodging: "$120–$300",
    allIn: "$1,050–$1,800",
    allInLow: 1050,
    tier: "Mid-High",
    ranking: 43,
    callout: "Atunyote (Fazio) + Shenendoah + Kaluhyat. Casino entertainment is the bonus.",
  },
  {
    slug: "western-nebraska",
    name: "Western Nebraska",
    state: "Nebraska",
    greenFees: "$30–$75",
    lodging: "$50–$130",
    allIn: "$285–$700",
    allInLow: 285,
    tier: "Value",
    ranking: 54,
    callout: "Golf The West packages from $285 (3 nights + 3 rounds total). Sandhills scenery rivals the courses.",
  },
  {
    slug: "whistling-straits",
    name: "Whistling Straits",
    state: "Wisconsin",
    greenFees: "$200–$400",
    lodging: "$280–$600",
    allIn: "$1,700–$2,600",
    allInLow: 1700,
    tier: "Premium",
    ranking: 2,
    callout: "Straits Course is walking-only. Caddie ($90) + tip ($70) per bag. American Club is the Midwest's only AAA Five Diamond resort.",
  },
];

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
    "Green fees, lodging costs, and all-in 3-day estimates for 55 ranked US golf trip destinations, with tier classification and per-destination callouts.",
  url: `${SITE_URL}/golf-trip-cost-index`,
  creator: { "@type": "Organization", name: "Golf Trip Index", url: SITE_URL },
  dateModified: "2026-05-01",
  variableMeasured: ["Green fees per round", "Lodging per night", "All-in cost per 3-day trip"],
};

export default function CostIndexPage() {
  const valueCount = TRIPS.filter((t) => t.tier === "Value").length;
  const premiumCount = TRIPS.filter((t) => t.tier === "Premium" || t.tier === "Ultra-Premium").length;
  const medianLow = [...TRIPS].sort((a, b) => a.allInLow - b.allInLow)[Math.floor(TRIPS.length / 2)].allInLow;

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
          all-in estimate for a 3-day group trip. All 55 GTI-ranked destinations, one table.
        </p>
        <div className={styles.metaRow}>
          <span className={styles.metaItem}><strong>55</strong> destinations</span>
          <span className={styles.metaItem}><strong>5</strong> cost tiers</span>
          <span className={styles.metaItem}><strong>Updated:</strong> May 2026</span>
          <span className={styles.metaItem}><strong>Methodology:</strong> posted rates + packages, not advertised minimums</span>
        </div>
      </div>

      <div className={styles.insights}>
        <h2 className={styles.insightsTitle}>By the numbers</h2>
        <div className={styles.insightCards}>
          <div className={styles.insightCard}>
            <p className={styles.insightCardLabel}>Cheapest all-in</p>
            <p className={styles.insightCardValue}>$285</p>
            <p className={styles.insightCardDesc}>
              Western Nebraska: 3 nights + 3 rounds through Golf The West packages.
              Sandhills scenery rivals courses twice the price.
            </p>
          </div>
          <div className={styles.insightCard}>
            <p className={styles.insightCardLabel}>Most expensive</p>
            <p className={styles.insightCardValue}>$4,200+</p>
            <p className={styles.insightCardDesc}>
              Pebble Beach tops the list, with 2 required resort nights before
              you can even book the Pebble tee time.
            </p>
          </div>
          <div className={styles.insightCard}>
            <p className={styles.insightCardLabel}>Median all-in</p>
            <p className={styles.insightCardValue}>${medianLow.toLocaleString()}</p>
            <p className={styles.insightCardDesc}>
              Half the ranked destinations come in under this mark for a 3-day trip,
              including several top-20 GTI finishers.
            </p>
          </div>
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
              GTI #18 for under $1,050 all-in. State park pricing on a U.S. Open
              and Ryder Cup venue.
            </p>
          </div>
        </div>
      </div>

      <CostIndexClient trips={TRIPS} />

      <div className={styles.methodology}>
        <h2 className={styles.methodologyTitle}>How we built this</h2>
        <p className={styles.methodologyText}>
          All estimates are based on 2026 posted green fee rates, verified package pricing, and
          mid-range lodging at or near each destination. Green fee ranges reflect the lowest
          available weekday rate and peak weekend rate at the primary course(s) for that destination.
          Lodging ranges use the most common accommodation type for a golf group (resort room or
          nearby hotel). All-in estimates cover 3 days of golf (typically 3–4 rounds), 3 nights of
          lodging, and exclude flights, food, caddie gratuities, and resort fees unless noted in the
          callout. Mandatory fees (forecaddies, resort fees, preservation funds) are called out
          per destination. Estimates are per-person and assume a group of four sharing lodging costs.
        </p>
      </div>
    </main>
  );
}
