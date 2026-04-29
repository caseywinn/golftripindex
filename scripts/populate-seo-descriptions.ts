/**
 * One-time script: create SEO Description field in Airtable GolfTrips table
 * and populate it for all published trips.
 *
 * Run: npx tsx scripts/populate-seo-descriptions.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config(); // also load .env as fallback
import Airtable from "airtable";

const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;
const TABLE_ID = "tblrGoUOTP5VnoM2F"; // GolfTrips
const FIELD_NAME = "SEO Description";

// ~130–155 chars, complete sentence, targets "golf trip" + group intent
const descriptions: Record<string, string> = {
  "arcadia-bluffs":
    "Northern Michigan's best-kept secret: Arcadia Bluffs delivers dramatic bluff-top golf at a fraction of the usual cost. Rated for group trips.",
  "aspen":
    "Aspen trades course volume for altitude and mountain scenery — best for groups who want golf as part of a broader Colorado mountain trip. Fully rated.",
  "bandon-dunes":
    "The bucket-list links pilgrimage: five distinct Pacific coast courses with zero distractions. Premium cost, world-class golf — fully rated for groups.",
  "banff":
    "Golf inside a UNESCO World Heritage Site. Banff's mountain courses are jaw-dropping, but the short season and premium cost demand real planning. Rated.",
  "bay-harbor":
    "Bay Harbor's Lake Michigan bluff courses punch above their weight for northern Michigan. Rated for groups prioritizing scenery and a relaxed pace.",
  "bend-oregon":
    "Bend's high-desert courses — Tetherow, Pronghorn, Crosswater — offer genuine variety at a fraction of Bandon's price. Full trip rated.",
  "bethpage":
    "Home of Bethpage Black and genuine public-golf prestige. A Long Island trip with big-name courses, tight logistics, and an East Coast edge. Rated.",
  "big-cedar-lodge":
    "Big Cedar Lodge packages Ozarks resort comfort with Fazio courses and Payne's Valley — a well-run, all-in-one Missouri destination rated for groups.",
  "biloxi":
    "Biloxi is the Gulf Coast's underrated golf escape: Fallen Oak is legitimately great, costs stay low, and the casino-and-golf format suits group trips.",
  "boston-and-new-england":
    "New England golf blends historic public tracks with coastal access — not a single-resort trip, but a routed experience. Full logistics and cost rated.",
  "broadmoor":
    "The Broadmoor is a true resort package: three courses, Colorado mountain backdrop, and all-in-one lodging. Rated for groups wanting a polished stay.",
  "cabot-cape-breton":
    "Cabot Cliffs may be the best course in North America. The full Cape Breton trip — two world-class layouts, remote coast, premium cost — is rated.",
  "cabot-citrus-farms":
    "Cabot Citrus Farms brings the brand's links pedigree to Florida — still maturing, but already a contender. Full trip experience rated.",
  "coeur-dalene":
    "Coeur d'Alene's floating green is a genuine icon, but the trip works best paired with nearby Circling Raven. Scenery, lodging, and cost rated.",
  "dallas":
    "Dallas offers premium urban golf with easy airport access — TPC Las Colinas, Cowboys Golf Club — but wins on convenience more than destination depth.",
  "eastern-nebraska":
    "Eastern Nebraska punches far above its profile: Firethorn, Awarii Dunes, and true sandhills golf at budget prices. A hidden group trip find.",
  "french-lick":
    "French Lick puts a Pete Dye and a restored Donald Ross inside one Indiana resort — solid golf, a working casino, and reasonable cost for groups.",
  "gamble-sands":
    "Gamble Sands is Washington's word-of-mouth secret: a pure walkable McLay Kidd design in the high desert with a wallet-friendly, easy-going vibe.",
  "giants-ridge":
    "Giants Ridge offers two high-quality courses in Minnesota's Iron Range at prices that make other golf trips blush. Ideal for groups on a budget.",
  "golden-horseshoe":
    "Colonial Williamsburg's Golden Horseshoe packs history and hospitality into a single-resort trip — two quality courses, walkable, fully rated.",
  "hilton-head":
    "Hilton Head delivers reliable Sea Island golf: Harbour Town leads, Sea Pines bundles it well, and the group-trip infrastructure is mature. Rated.",
  "innisbrook":
    "Innisbrook's Copperhead Course is a PGA Tour stop — legitimately tough, well-routed, and part of a resort that handles group logistics cleanly. Rated.",
  "kiawah-island":
    "Kiawah's Ocean Course is the draw, but the full trip — resort lodging, coast setting, and four other strong tracks — is what earns its ranking. Rated.",
  "lajitas-tx":
    "West Texas golf near Big Bend: Lajitas is as remote as it gets, with a legitimately great course and a cowboy-meets-luxury ranch vibe. Full trip rated.",
  "lake-tahoe":
    "Edgewood at Lake Tahoe delivers a jaw-dropping mountain-lake backdrop, but thin course volume means this works best paired with non-golf activities.",
  "las-vegas":
    "Shadow Creek, Cascata, and Paiute make Vegas a legit premium golf destination. Rated for groups who mix top-end courses with off-course entertainment.",
  "mclemore":
    "McLemore sits atop Lookout Mountain with valley views and a layout that rivals destinations costing twice as much. A rising Southeastern group trip.",
  "myrtle-beach":
    "Myrtle Beach is the American golf trip template: 80-plus courses, budget-to-premium options, and infrastructure built entirely for groups. Fully rated.",
  "napa":
    "Napa golf is deliberate — Silverado leads a short but quality course list, and the food and wine scene makes it one of the best all-around group trips.",
  "new-mexico":
    "New Mexico offers high-desert golf few groups consider — Black Mesa, Red Sky, and a Santa Fe base with standout food and easy logistics. Fully rated.",
  "north-dakota":
    "North Dakota's Bully Pulpit and Links of ND are legitimately world-class and nearly empty — the best pure golf value in the country. Rated.",
  "omni-barton-creek":
    "Barton Creek delivers four Hill Country courses within one resort, with Austin's dining and nightlife nearby. Efficient logistics for group trips. Rated.",
  "omni-homestead":
    "The Homestead is American golf history — two mountain courses, a classic resort, and a Virginia backdrop that makes it feel removed from everything. Rated.",
  "palm-springs":
    "Palm Springs offers desert golf at scale: PGA West's Stadium Course, La Quinta, and enough variety to fill a week. Full trip cost and quality rated.",
  "pebble-beach":
    "Pebble Beach is the American golf pilgrimage — but the Monterey Peninsula trip requires real planning to justify premium cost. Full experience rated.",
  "pinehurst-area":
    "The best Pinehurst trip might skip the Resort — base in Southern Pines and access a dozen elite Donald Ross tracks. Full area trip rated.",
  "pinehurst-resort":
    "Pinehurst Resort is the classic single-property stay: No. 2 leads, the package is polished, and the golf history is unmatched. Full resort trip rated.",
  "reynolds-lake-oconee":
    "Reynolds Lake Oconee bundles five solid courses with lakeside resort lodging in Georgia — a reliable, well-run group destination at a moderate price.",
  "roscommon":
    "Roscommon anchors a budget-friendly northern Michigan cluster — high course volume, honest prices, and the piney lodge vibe groups keep returning to.",
  "rtj-trail":
    "Alabama's RTJ Trail is the best golf value in the country: 11 sites, hundreds of holes, world-class Tom Fazio designs at municipal prices. Rated.",
  "san-diego":
    "San Diego packs Torrey Pines, La Costa, and Aviara into a trip with perfect weather, ocean views, and year-round playability. Full experience rated.",
  "sand-valley":
    "Sand Valley is Wisconsin's answer to Bandon: three distinct Coore-Crenshaw courses in the middle of nowhere, at less than half the price. Fully rated.",
  "santa-barbara":
    "Santa Barbara golf is modest in scale but punches up with coastal views and Sandpiper's ocean holes — best as a stop on a longer California trip.",
  "sawgrass":
    "TPC Sawgrass and the iconic 17th Island Hole anchor a Jacksonville-area trip with solid secondary courses and clean resort infrastructure. Rated.",
  "scottsdale":
    "Scottsdale is the desert trip captain's dream: TPC, Troon, Whisper Rock, and more courses than a week can hold. Golf, food, lodging, and cost — all rated.",
  "sea-island":
    "Sea Island's three courses and Ritz-level resort create a polished single-property trip on the Georgia coast — premium cost, premium experience. Rated.",
  "silvies-ranch":
    "Silvies Valley Ranch in eastern Oregon offers a reversible course, backcountry lodge, and a genuinely unique group trip format. Cost and quality rated.",
  "southern-utah":
    "Southern Utah's red-rock golf — Entrada, Coral Canyon, Red Hills — pairs world-class scenery with courses that are genuinely underrated. Full trip rated.",
  "streamsong":
    "Streamsong is Florida golf's best-kept secret: three elite designers, one resort, no distractions. Rates near the top for group trips. Fully rated.",
  "the-greenbrier":
    "The Greenbrier delivers Old White, two supporting courses, and full resort luxury in the West Virginia mountains. History, hospitality, and ratings.",
  "top-100":
    "The highest concentration of Top 100 courses in one trip — rated for groups chasing bucket-list rounds. Golf, logistics, cost, and value all covered.",
  "treetops":
    "Treetops Resort packs five Nicklaus courses into northern Michigan's piney hills — high course volume, accessible prices, and a group-friendly lodge.",
  "tucson":
    "Tucson offers Scottsdale-quality desert golf at a noticeably lower price point — Ventana Canyon, Starr Pass, and a relaxed pace. Full trip rated.",
  "turning-stone":
    "Turning Stone in upstate New York is the casino-resort golf template done well: three strong courses and a full resort under one roof. Fully rated.",
  "western-nebraska":
    "Western Nebraska is the pure sandhills experience — Sandhills Golf Club, Wild Horse, Prairie Club — remote, cheap, and among the best golf in the country.",
  "whistling-straits":
    "Whistling Straits and Blackwolf Run anchor one of the Midwest's premier golf packages — Kohler's American Club runs it to an exacting standard. Rated.",
};

async function checkFieldExists(): Promise<boolean> {
  const res = await fetch(
    `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`,
    {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }
  );
  if (!res.ok) return false;
  const body = await res.json() as any;
  const table = (body.tables ?? []).find((t: any) => t.id === TABLE_ID);
  return (table?.fields ?? []).some((f: any) => f.name === FIELD_NAME);
}

async function fetchAllPublishedTrips() {
  Airtable.configure({ apiKey: API_KEY });
  const base = Airtable.base(BASE_ID);

  const records = await base("GolfTrips")
    .select({
      filterByFormula: `{Status}="published"`,
      fields: ["Slug", "Name"],
      maxRecords: 200,
    })
    .all();

  return records.map((r) => ({
    id: r.id,
    slug: r.fields["Slug"] as string,
    name: r.fields["Name"] as string,
  }));
}

async function updateRecord(recordId: string, description: string) {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/GolfTrips/${recordId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: { [FIELD_NAME]: description },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to update ${recordId}: ${res.status} ${body}`);
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`Step 1: Checking for "${FIELD_NAME}" field…`);
  const fieldExists = await checkFieldExists();
  if (!fieldExists) {
    console.error(
      `\nField "${FIELD_NAME}" not found in GolfTrips.\n` +
      `Please add it manually in Airtable:\n` +
      `  1. Open the GolfTrips table\n` +
      `  2. Click "+" to add a field\n` +
      `  3. Name it exactly: SEO Description\n` +
      `  4. Type: Long text\n` +
      `  5. Re-run this script.\n`
    );
    process.exit(1);
  }
  console.log(`  Field "${FIELD_NAME}" exists. Proceeding.`);

  console.log("\nStep 2: Fetch all published trips…");
  const trips = await fetchAllPublishedTrips();
  console.log(`  Found ${trips.length} published trips.`);

  const missing: string[] = [];
  const longDescriptions: string[] = [];

  // Validate descriptions before writing
  for (const { slug } of trips) {
    if (!descriptions[slug]) {
      missing.push(slug);
    } else if (descriptions[slug].length > 160) {
      longDescriptions.push(`${slug} (${descriptions[slug].length} chars)`);
    }
  }

  if (missing.length) {
    console.warn(`\nWARNING: No description for slugs:\n  ${missing.join("\n  ")}`);
  }
  if (longDescriptions.length) {
    console.warn(`\nWARNING: Descriptions over 160 chars:\n  ${longDescriptions.join("\n  ")}`);
  }

  console.log("\nStep 3: Update records (5 req/sec to stay under rate limit)…");

  let updated = 0;
  let skipped = 0;

  for (const { id, slug, name } of trips) {
    const desc = descriptions[slug];
    if (!desc) {
      console.log(`  SKIP  ${slug} (no description)`);
      skipped++;
      continue;
    }

    await updateRecord(id, desc);
    console.log(`  OK    ${slug} (${desc.length} chars)`);
    updated++;

    // Airtable free tier: 5 req/s — stay safe at ~4/s
    await sleep(250);
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
