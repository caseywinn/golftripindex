import OpenAI from "openai";
import Airtable from "airtable";
import { gtiSearch, getTripDetailBySlug, getTripsTop100Counts, getTripsTopNCourseCounts, getTopTripsByRating } from "@/lib/gti";
import type { TripRatingMetric } from "@/lib/gti";
import { getPublishedJourneyBySlug } from "@/lib/airtable";
import type { TripDetail } from "@/lib/gti";
import type { JourneyWithStops, GolfCourse } from "@/lib/types";

export type ContextType = "trip" | "journey";

export type UniversalTurnInput = {
  content: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  contextSlug?: string;
  contextType?: ContextType;
};

export type UniversalTurnOutput = {
  assistantContent: string;
  followUpOptions: string[];
};

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function escFormula(s: string) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ---- LongTrip search (not in gti.ts) ----

async function searchLongTrips(query: string) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return [];

  Airtable.configure({ apiKey });
  const base = Airtable.base(baseId);
  const q = query.trim().toLowerCase().slice(0, 60);
  if (!q) return [];

  const qEsc = escFormula(q);
  const filter = `AND({Status}="published",OR(FIND("${qEsc}",LOWER({Name})),FIND("${qEsc}",LOWER({Slug}))))`;

  try {
    const rows = await base("LongTrips")
      .select({ filterByFormula: filter, maxRecords: 5 })
      .firstPage();

    return rows
      .map((r) => ({
        id: r.id,
        slug: String((r.fields as any)["Slug"] ?? ""),
        name: String((r.fields as any)["Name"] ?? ""),
        description: String((r.fields as any)["Description"] ?? ""),
        fullDescription: String((r.fields as any)["Full Description"] ?? ""),
        costTier: (r.fields as any)["Cost Tier"] as number | undefined,
        durationMinDays: (r.fields as any)["Duration Min Days"] as number | undefined,
        durationMaxDays: (r.fields as any)["Duration Max Days"] as number | undefined,
      }))
      .filter((r) => r.slug && r.name);
  } catch {
    return [];
  }
}

// ---- Context formatters ----

function formatCourse(c: GolfCourse): string {
  let s = c.name;
  if (c.consolidatedRanking) s += ` (#${c.consolidatedRanking} nationally)`;
  if (c.state) s += ` [${c.state}]`;
  return s;
}

function formatTripContext(detail: TripDetail): string {
  const { trip, courses } = detail;
  const lines: string[] = [
    `TRIP: ${trip.name}${trip.secondaryName ? ` (${trip.secondaryName})` : ""}`,
    `Duration: ${trip.durationMinDays}–${trip.durationMaxDays} days | Cost Tier: ${trip.costTier ?? "??"}/5`,
    trip.leadTime ? `Lead Time: ${trip.leadTime}` : "",
    "",
    trip.fullDescription ? `Overview:\n${trip.fullDescription}` : "",
    trip.foodAndLodgingOverview ? `\nFood & Lodging:\n${trip.foodAndLodgingOverview}` : "",
    trip.wantMore ? `\nWant More:\n${trip.wantMore}` : "",
    trip.dataDump ? `\nAdditional Info:\n${trip.dataDump}` : "",
    "",
  ];

  if (courses.must_play.length)
    lines.push(`Must-Play Courses: ${courses.must_play.map(formatCourse).join(", ")}`);
  if (courses.should_play.length)
    lines.push(`Should-Play Courses: ${courses.should_play.map(formatCourse).join(", ")}`);
  if (courses.want_more.length)
    lines.push(`Want-More Courses: ${courses.want_more.map(formatCourse).join(", ")}`);

  return lines.filter(Boolean).join("\n");
}

function formatJourneyContext(journey: JourneyWithStops): string {
  const lines: string[] = [
    `JOURNEY: ${journey.name}`,
    `Duration: ${journey.durationMinDays}–${journey.durationMaxDays} days`,
    journey.costTier ? `Cost Tier: ${journey.costTier}/5` : "",
    "",
    journey.description ? `Overview:\n${journey.description}` : "",
    journey.fullDescription ? `\nFull Description:\n${journey.fullDescription}` : "",
    "\nSTOPS:",
  ];

  for (const stop of journey.stops) {
    lines.push(
      `\nStop ${stop.stopOrder}: ${stop.locationName} (${stop.overnight ? "Overnight" : "Day stop"})`
    );
    const must = stop.courses.filter((c) => c.importance === "must_play");
    const should = stop.courses.filter((c) => c.importance === "should_play");
    const optional = stop.courses.filter((c) => c.importance === "want_more");
    if (must.length) lines.push(`  Must Play: ${must.map((c) => formatCourse(c.course)).join(", ")}`);
    if (should.length) lines.push(`  Should Play: ${should.map((c) => formatCourse(c.course)).join(", ")}`);
    if (optional.length) lines.push(`  Optional: ${optional.map((c) => formatCourse(c.course)).join(", ")}`);
    if (stop.overnight) {
      if (stop.hotels) lines.push(`  Hotels: ${stop.hotels}`);
      if (stop.restaurants) lines.push(`  Restaurants: ${stop.restaurants}`);
    }
    if (stop.bookingAdvice) lines.push(`  Booking Advice: ${stop.bookingAdvice}`);
    if (stop.notes) lines.push(`  Notes: ${stop.notes}`);
  }

  return lines.filter(Boolean).join("\n");
}

// ---- System prompt ----

function buildSystemPrompt(seededContext?: string): string {
  const contextBlock = seededContext
    ? `\nCURRENT PAGE CONTEXT — the user is viewing this specific trip or journey. Lead with specific, knowledgeable answers about it. Use search_gti only for supplementary information (comparisons, nearby courses, etc.):\n\n${seededContext}\n`
    : `\nNo specific trip is loaded. For direct factual questions (rankings, course counts, comparisons, logistics, etc.) answer immediately using search_gti — do not ask for preferences first. Only ask clarifying questions when the user is genuinely asking for a personalized trip recommendation and hasn't provided enough context (group size, days, budget, vibe) to give a useful answer.\n`;

  return `You are an expert golf travel agent for GolfTripIndex.com. You speak with authority about golf destinations, courses, and travel logistics. You are knowledgeable, opinionated, and direct — you make specific recommendations rather than hedging.
${contextBlock}
TOOLS:
- Use search_gti first for any question about golf trips, courses, destinations, rankings, or course counts. It searches trips, courses, multi-stop journeys, and can answer ranking queries like "most top 100 courses."
- For questions about food, restaurants, bars, lodging, or hotels: always call search_gti first, then always follow up with search_web to supplement with current, specific options. Do both every time, even if search_gti returns results.
- For all other questions: use search_web only when search_gti cannot answer (airport logistics, current course conditions, general travel questions). Restrict web searches to golf and travel topics only.

CONTENT RULES:
- Only discuss golf trips, golf courses, travel logistics (airports, driving routes, hotels, restaurants near golf destinations).
- Politely decline and redirect any question about medicine, health, mental health, politics, violence, or anything unrelated to golf travel.
- NEVER mention a database, data retrieval, or inability to look something up. If you lack specific details, just answer with what you know confidently.

COMPARISON RULE:
- When the user asks to compare two trips, give a quick 2–3 sentence preview of the key differences, then end with a markdown link to the full comparison page: [Compare {Trip A} vs {Trip B}](/compare/{slug-a}-vs-{slug-b}). Use the exact slugs from search results.
- When the user says "help me decide between two trips" or similar without naming the trips, ask them which two trips they have in mind. Once they name both, search for them, then apply the comparison rule above.

CONVERSATION APPROACH:
- Answer factual questions directly and immediately. Never deflect a clear question by asking for preferences instead.
- Only collect group size, days, budget, and vibe when the user is asking for a personalized trip recommendation without enough detail to give a good answer.
- When context is loaded (trip or journey page): answer directly and specifically. Offer follow-up angles.
- Reference courses by name and ranking when relevant. Be opinionated about must-plays vs nice-to-haves.
- Multi-turn: remember what was discussed. If the topic shifts to a new destination, pivot naturally while retaining prior history.

OUTPUT FORMAT — your entire response must be a single JSON object with no text before or after it:
{"assistantContent":"...","followUpOptions":["...","...","..."]}
- assistantContent: use markdown formatting (bold for names, bullet lists for options). Never output plain text outside this JSON.
- followUpOptions: always include 2–4 short follow-up questions phrased as if the USER is asking the AI — things they would naturally want to know next. Never include questions the AI would ask the user (clarifying questions, preference questions, etc.). Example good options: "Which of these has the best food?" "How far is the drive?" "What courses are must-play?" Bad options: "What type of courses interest you?" "Do you have a budget in mind?"`;
}

// ---- Tool definitions ----

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_gti",
      description:
        "Search the Golf Trip Index database. Use for: trips by season (winter/spring/summer/fall), trips by state or region, best/top-rated trips (overall, golf, food, lodging, vibe), course rankings and top-100 counts, trip durations, cost tiers, and any question about specific golf destinations or courses. Always use this before search_web. IMPORTANT: When the user asks about weekend trips, short trips, quick trips, or 2-day trips, you MUST pass \"weekend trips\" as the query exactly.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Specific search query. Use destination names, course names, or state/region names. Avoid full sentences.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Search the web for golf and travel information not in the GTI database. Limited to golf, courses, airports, hotels, and restaurants near golf destinations.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query focused on golf or travel logistics.",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ---- Airtable direct-field query helpers ----

const SEASON_KEYWORDS: Record<string, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  autumn: "Fall",
};

const RATING_KEYWORDS: Record<string, TripRatingMetric> = {
  golf: "golf",
  "golf rating": "golf",
  "best golf": "golf",
  food: "food",
  "food rating": "food",
  "best food": "food",
  restaurant: "food",
  dining: "food",
  lodging: "lodging",
  "lodging rating": "lodging",
  "best lodging": "lodging",
  hotel: "lodging",
  hotels: "lodging",
  vibe: "vibe",
  "best vibe": "vibe",
  atmosphere: "vibe",
  scene: "vibe",
};

function detectSeason(query: string): string | null {
  const q = query.toLowerCase();
  for (const [keyword, season] of Object.entries(SEASON_KEYWORDS)) {
    if (q.includes(keyword)) return season;
  }
  return null;
}

function detectRatingMetric(query: string): TripRatingMetric {
  const q = query.toLowerCase();
  for (const [keyword, metric] of Object.entries(RATING_KEYWORDS)) {
    if (q.includes(keyword)) return metric;
  }
  return "overall";
}

function isBestOrTopQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    q.includes("best trip") ||
    q.includes("best trips") ||
    q.includes("top trip") ||
    q.includes("top trips") ||
    q.includes("top rated") ||
    q.includes("highest rated") ||
    q.includes("most recommended") ||
    q.includes("recommend a trip") ||
    q.includes("best overall") ||
    q.includes("best destination") ||
    (q.includes("best") && !q.includes("best time") && !q.includes("best way") && !q.includes("best course"))
  );
}

function detectState(query: string): string | null {
  const STATE_NAMES: Record<string, string> = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
    california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
    florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
    illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
    kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
    massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
    missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
    oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
    vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
    wisconsin: "WI", wyoming: "WY",
  };
  const q = query.toLowerCase();
  for (const [name, abbr] of Object.entries(STATE_NAMES)) {
    if (q.includes(name)) return abbr;
  }
  // Check abbreviations
  const abbrMatch = query.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/);
  if (abbrMatch) return abbrMatch[1];
  return null;
}

async function searchTripsBySeason(season: string): Promise<string> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return "Airtable not configured.";

  Airtable.configure({ apiKey });
  const base = Airtable.base(baseId);

  const filter = `AND({Status}="published",FIND("${escFormula(season)}",ARRAYJOIN({Best Seasons},",")))`;

  try {
    const rows = await base("GolfTrips")
      .select({ filterByFormula: filter, maxRecords: 50 })
      .all();

    if (!rows.length) return `No trips found for the ${season} season.`;

    const trips = rows
      .map((r) => {
        const f: any = r.fields;
        const name = f["Name"];
        const slug = f["Slug"];
        if (!name || !slug) return null;
        return {
          name: String(name),
          slug: String(slug),
          state: f["State"] ? String(f["State"]) : undefined,
          overallRating: typeof f["Overall Rating"] === "number" ? f["Overall Rating"] : 0,
          golfRating: typeof f["Golf Rating"] === "number" ? f["Golf Rating"] : 0,
          costTier: typeof f["Cost Tier"] === "number" ? f["Cost Tier"] : undefined,
          durationMin: typeof f["Duration Min Days"] === "number" ? f["Duration Min Days"] : undefined,
          durationMax: typeof f["Duration Max Days"] === "number" ? f["Duration Max Days"] : undefined,
          overview: f["Overview"] ? String(f["Overview"]).slice(0, 300) : undefined,
          foodAndLodging: f["Food and Lodging Overview"] ? String(f["Food and Lodging Overview"]).slice(0, 200) : undefined,
          dataDump: f["Data Dump"] ? String(f["Data Dump"]).slice(0, 300) : undefined,
        };
      })
      .filter(Boolean) as any[];

    trips.sort((a, b) => b.overallRating - a.overallRating);

    const lines = [`TRIPS AVAILABLE IN ${season.toUpperCase()} (sorted by overall rating):`];
    for (const t of trips) {
      lines.push(`\n${t.name}${t.state ? ` (${t.state})` : ""}`);
      lines.push(`  Rating: ${t.overallRating}/10 | Golf: ${t.golfRating}/10 | Cost Tier: ${t.costTier ?? "?"}/5 | Duration: ${t.durationMin}–${t.durationMax} days`);
      if (t.overview) lines.push(`  ${t.overview}`);
      if (t.foodAndLodging) lines.push(`  Food & Lodging: ${t.foodAndLodging}`);
      if (t.dataDump) lines.push(`  ${t.dataDump}`);
    }
    return lines.join("\n");
  } catch (e: any) {
    return `Season search failed: ${e?.message ?? "unknown"}`;
  }
}

async function searchTripsByState(state: string): Promise<string> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return "Airtable not configured.";

  Airtable.configure({ apiKey });
  const base = Airtable.base(baseId);

  const filter = `AND({Status}="published",{State}="${escFormula(state)}")`;

  try {
    const rows = await base("GolfTrips")
      .select({ filterByFormula: filter, maxRecords: 50 })
      .all();

    if (!rows.length) return `No published trips found in state: ${state}.`;

    const lines = [`TRIPS IN ${state}:`];
    for (const r of rows) {
      const f: any = r.fields;
      const name = f["Name"];
      if (!name) continue;
      lines.push(`\n${String(name)}`);
      const overall = typeof f["Overall Rating"] === "number" ? f["Overall Rating"] : null;
      const golf = typeof f["Golf Rating"] === "number" ? f["Golf Rating"] : null;
      const cost = typeof f["Cost Tier"] === "number" ? f["Cost Tier"] : null;
      const durMin = typeof f["Duration Min Days"] === "number" ? f["Duration Min Days"] : null;
      const durMax = typeof f["Duration Max Days"] === "number" ? f["Duration Max Days"] : null;
      if (overall || golf || cost) {
        lines.push(`  Rating: ${overall ?? "?"}/10 | Golf: ${golf ?? "?"}/10 | Cost Tier: ${cost ?? "?"}/5 | Duration: ${durMin}–${durMax} days`);
      }
      if (f["Overview"]) lines.push(`  ${String(f["Overview"]).slice(0, 300)}`);
      if (f["Data Dump"]) lines.push(`  ${String(f["Data Dump"]).slice(0, 300)}`);
    }
    return lines.join("\n");
  } catch (e: any) {
    return `State search failed: ${e?.message ?? "unknown"}`;
  }
}

const WEEKEND_TRIP_EXCLUDES = ["cabot-cape-breton", "banff"];

async function searchWeekendTrips(): Promise<string> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return "Airtable not configured.";

  Airtable.configure({ apiKey });
  const base = Airtable.base(baseId);

  const filter = `AND({Status}="published",{Duration Min Days}=2)`;

  try {
    const rows = await base("GolfTrips")
      .select({ filterByFormula: filter, maxRecords: 50 })
      .all();

    if (!rows.length) return "No weekend trips found.";

    const trips = rows
      .map((r) => {
        const f: any = r.fields;
        const slug = String(f["Slug"] ?? "");
        if (!slug || !f["Name"]) return null;
        if (WEEKEND_TRIP_EXCLUDES.includes(slug.toLowerCase())) return null;
        return {
          name: String(f["Name"]),
          slug,
          state: f["State"] ? String(f["State"]) : undefined,
          overallRating: typeof f["Overall Rating"] === "number" ? f["Overall Rating"] : 0,
          golfRating: typeof f["Golf Rating"] === "number" ? f["Golf Rating"] : 0,
          costTier: typeof f["Cost Tier"] === "number" ? f["Cost Tier"] : undefined,
          durationMin: typeof f["Duration Min Days"] === "number" ? f["Duration Min Days"] : undefined,
          durationMax: typeof f["Duration Max Days"] === "number" ? f["Duration Max Days"] : undefined,
          overview: f["Overview"] ? String(f["Overview"]).slice(0, 300) : undefined,
        };
      })
      .filter(Boolean) as any[];

    trips.sort((a, b) => b.overallRating - a.overallRating);

    const lines = ["BEST WEEKEND TRIPS (Duration Min Days = 2, sorted by overall rating):"];
    for (const t of trips) {
      lines.push(`\n${t.name}${t.state ? ` (${t.state})` : ""} [slug: ${t.slug}]`);
      lines.push(`  Rating: ${t.overallRating}/10 | Golf: ${t.golfRating}/10 | Cost Tier: ${t.costTier ?? "?"}/5 | Duration: ${t.durationMin}–${t.durationMax} days`);
      if (t.overview) lines.push(`  ${t.overview}`);
    }
    return lines.join("\n");
  } catch (e: any) {
    return `Weekend trip search failed: ${e?.message ?? "unknown"}`;
  }
}

async function searchTripsByRating(metric: TripRatingMetric, season?: string): Promise<string> {
  try {
    const trips = await getTopTripsByRating(metric, 10);
    if (!trips.length) return "No rated trips found.";

    const label = metric === "overall" ? "Overall" : metric.charAt(0).toUpperCase() + metric.slice(1);
    const header = season
      ? `TOP TRIPS FOR ${season.toUpperCase()} BY ${label.toUpperCase()} RATING:`
      : `TOP TRIPS BY ${label.toUpperCase()} RATING:`;
    const lines = [header];

    for (const t of trips) {
      const rating =
        metric === "golf" ? t.golfRating :
        metric === "food" ? t.foodRating :
        metric === "lodging" ? t.lodgingRating :
        metric === "vibe" ? t.vibeRating :
        t.overallRating;
      lines.push(`\n${t.name}${t.secondaryName ? ` (${t.secondaryName})` : ""}`);
      lines.push(`  ${label} Rating: ${rating ?? "N/A"}/10 | Cost Tier: ${t.costTier ?? "?"}/5 | Duration: ${t.durationMinDays}–${t.durationMaxDays} days`);
    }
    return lines.join("\n");
  } catch (e: any) {
    return `Rating search failed: ${e?.message ?? "unknown"}`;
  }
}

// ---- Tool execution ----

function isRankingQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    q.includes("top 100") ||
    q.includes("top100") ||
    q.includes("most top") ||
    q.includes("most courses") ||
    q.includes("ranked courses") ||
    q.includes("best ranked") ||
    q.includes("top 50") ||
    q.includes("top 25") ||
    q.includes("top 10") ||
    q.includes("most ranked")
  );
}

function extractTopN(query: string): number {
  const m = query.match(/top\s*(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 1000) return n;
  }
  return 100;
}

function isWeekendTripQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    q.includes("weekend trip") ||
    q.includes("weekend trips") ||
    q.includes("quick hitter") ||
    q.includes("quick hitters") ||
    q.includes("short trip") ||
    q.includes("short trips") ||
    q.includes("2-day trip") ||
    q.includes("2 day trip") ||
    q.includes("quick trip") ||
    q.includes("quick trips") ||
    q.includes("long weekend")
  );
}

async function executeSearchGTI(query: string): Promise<string> {
  // Weekend trip queries
  if (isWeekendTripQuery(query)) {
    return await searchWeekendTrips();
  }

  // Ranking queries: "which trips have the most top 100 courses", etc.
  if (isRankingQuery(query)) {
    const topN = extractTopN(query);
    try {
      const counts =
        topN === 100
          ? await getTripsTop100Counts()
          : await getTripsTopNCourseCounts({ topN });

      if (!counts.length) return "No ranking data found.";

      const lines = [`TOP TRIPS BY TOP ${topN} COURSE COUNT:`];
      for (const t of counts.slice(0, 15)) {
        const count = "top100Count" in t ? t.top100Count : t.count;
        const courses =
          "top100Courses" in t
            ? t.top100Courses
            : (t as any).courses ?? [];
        const courseNames = courses
          .slice(0, 5)
          .map((c: any) => `${c.courseName ?? c.name}${c.consolidatedRanking ? ` (#${c.consolidatedRanking})` : ""}`)
          .join(", ");
        lines.push(`\n${t.tripName}: ${count} top ${topN} courses`);
        if (courseNames) lines.push(`  Courses: ${courseNames}${courses.length > 5 ? ` +${courses.length - 5} more` : ""}`);
      }
      return lines.join("\n");
    } catch {
      // Fall through to text search
    }
  }

  // Season queries: filter by Best Seasons field
  const season = detectSeason(query);
  if (season) {
    const seasonResult = await searchTripsBySeason(season);
    // If also a "best" query, lead with rating-sorted context
    if (isBestOrTopQuery(query)) {
      const metric = detectRatingMetric(query);
      const ratingResult = await searchTripsByRating(metric, season);
      return `${seasonResult}\n\n${ratingResult}`;
    }
    return seasonResult;
  }

  // Best/top-rated queries with no specific destination
  if (isBestOrTopQuery(query)) {
    const metric = detectRatingMetric(query);
    return await searchTripsByRating(metric);
  }

  // State/region queries
  const state = detectState(query);
  if (state) {
    return await searchTripsByState(state);
  }

  const [gtiHits, longTrips] = await Promise.all([
    gtiSearch(query).catch(() => []),
    searchLongTrips(query),
  ]);

  if (!gtiHits.length && !longTrips.length) {
    return "No results found in the GTI database for that query.";
  }

  const lines: string[] = ["GTI DATABASE RESULTS:"];

  for (const hit of gtiHits) {
    if (hit.type === "trip") {
      const t = hit.trip;
      lines.push(`\nTRIP: ${t.name}${t.secondaryName ? ` (${t.secondaryName})` : ""} [slug: ${t.slug}]`);
      lines.push(`  Duration: ${t.durationMinDays}–${t.durationMaxDays} days | Cost Tier: ${t.costTier}/5 | Rating: ${t.overallRating}/10`);
      if (t.fullDescription) lines.push(`  ${t.fullDescription.slice(0, 400)}`);
      if (t.foodAndLodgingOverview) lines.push(`  Food & Lodging: ${t.foodAndLodgingOverview.slice(0, 200)}`);
      if (t.dataDump) lines.push(`  ${t.dataDump.slice(0, 400)}`);

      try {
        const detail = await getTripDetailBySlug(t.slug);
        if (detail) {
          const { courses } = detail;
          if (courses.must_play.length)
            lines.push(`  Must-Play: ${courses.must_play.map(formatCourse).join(", ")}`);
          if (courses.should_play.length)
            lines.push(`  Should-Play: ${courses.should_play.map(formatCourse).join(", ")}`);
          if (courses.want_more.length)
            lines.push(`  Want More: ${courses.want_more.map(formatCourse).join(", ")}`);
        }
      } catch {
        // Non-fatal: skip course details
      }
    } else if (hit.type === "course") {
      const c = hit.course;
      lines.push(`\nCOURSE: ${c.name}`);
      if (c.state) lines.push(`  State: ${c.state}`);
      if (c.courseType) lines.push(`  Type: ${c.courseType}`);
      if (c.consolidatedRanking) lines.push(`  National Ranking: #${c.consolidatedRanking}`);
      if (c.dataDump) lines.push(`  ${c.dataDump.slice(0, 500)}`);
    }
  }

  for (const journey of longTrips) {
    lines.push(`\nJOURNEY (Multi-Stop): ${journey.name}`);
    if (journey.durationMinDays)
      lines.push(`  Duration: ${journey.durationMinDays}–${journey.durationMaxDays} days`);
    if (journey.costTier) lines.push(`  Cost Tier: ${journey.costTier}/5`);
    if (journey.description) lines.push(`  ${journey.description.slice(0, 300)}`);

    try {
      const full = await getPublishedJourneyBySlug(journey.slug);
      if (full?.stops.length) {
        for (const stop of full.stops) {
          const must = stop.courses.filter((c) => c.importance === "must_play");
          lines.push(`  Stop ${stop.stopOrder}: ${stop.locationName}`);
          if (must.length)
            lines.push(`    Must Play: ${must.map((c) => formatCourse(c.course)).join(", ")}`);
          if (stop.hotels) lines.push(`    Hotels: ${stop.hotels}`);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return lines.join("\n");
}

async function executeSearchWeb(query: string): Promise<string> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return "Web search is not configured.";

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `golf travel ${query}`,
        num_results: 5,
        type: "auto",
        contents: { text: { max_characters: 800 } },
      }),
    });

    if (!res.ok) return "Web search failed.";

    const data = await res.json();
    const results: any[] = data?.results ?? [];
    if (!results.length) return "No web results found.";

    const lines = ["WEB SEARCH RESULTS:"];
    for (const r of results) {
      lines.push(`\n${r.title ?? "Untitled"}`);
      if (r.url) lines.push(`URL: ${r.url}`);
      if (r.text) lines.push(String(r.text).slice(0, 700));
    }
    return lines.join("\n");
  } catch {
    return "Web search failed.";
  }
}

// ---- Response parser ----

function stripJsonFences(s: string): string {
  return s
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseModelResponse(raw: string): UniversalTurnOutput {
  const cleaned = stripJsonFences(raw.trim());

  const tryParse = (s: string): UniversalTurnOutput | null => {
    try {
      const parsed = JSON.parse(s);
      const assistantContent = String(parsed?.assistantContent ?? "").trim();
      const followUpOptions = Array.isArray(parsed?.followUpOptions)
        ? parsed.followUpOptions.filter((s: unknown) => typeof s === "string")
        : [];
      if (assistantContent) return { assistantContent, followUpOptions };
    } catch {
      return null;
    }
    return null;
  };

  // Try direct parse
  const direct = tryParse(cleaned);
  if (direct) return direct;

  // Model output mixed text + JSON — extract the embedded JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*"assistantContent"[\s\S]*\}/);
  if (jsonMatch) {
    const embedded = tryParse(jsonMatch[0]);
    if (embedded) return embedded;
  }

  return {
    assistantContent: cleaned || "I'm not sure how to answer that — can you rephrase?",
    followUpOptions: [],
  };
}

// ---- Main engine ----

export async function runUniversalTurn(input: UniversalTurnInput): Promise<UniversalTurnOutput> {
  const openai = getOpenAI();

  let seededContext: string | undefined;
  if (input.contextSlug && input.contextType) {
    try {
      if (input.contextType === "trip") {
        const detail = await getTripDetailBySlug(input.contextSlug);
        if (detail) seededContext = formatTripContext(detail);
      } else if (input.contextType === "journey") {
        const journey = await getPublishedJourneyBySlug(input.contextSlug);
        if (journey) seededContext = formatJourneyContext(journey);
      }
    } catch {
      // Non-fatal: proceed without context
    }
  }

  const systemPrompt = buildSystemPrompt(seededContext);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...input.messages.slice(-14).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: input.content },
  ];

  let currentMessages = [...messages];

  // Agentic loop — cap at 4 iterations
  for (let i = 0; i < 4; i++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: currentMessages,
      tools: TOOLS,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    if (!choice) break;

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls?.length) {
      const toolCalls = choice.message.tool_calls;

      const toolResults = await Promise.all(
        toolCalls.map(async (tc) => {
          let result: string;
          try {
            const fn = (tc as any).function as { name: string; arguments: string };
            const args = JSON.parse(fn.arguments || "{}");
            if (fn.name === "search_gti") {
              result = await executeSearchGTI(String(args.query ?? ""));
            } else if (fn.name === "search_web") {
              result = await executeSearchWeb(String(args.query ?? ""));
            } else {
              result = "Unknown tool.";
            }
          } catch (e: any) {
            result = `Tool error: ${e?.message ?? "unknown"}`;
          }
          return { role: "tool" as const, tool_call_id: tc.id, content: result };
        })
      );

      currentMessages = [...currentMessages, choice.message, ...toolResults];
    } else {
      return parseModelResponse(choice.message.content ?? "");
    }
  }

  return {
    assistantContent: "Something went wrong. Please try again.",
    followUpOptions: [],
  };
}
