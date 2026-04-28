import Airtable from "airtable";
import type {
  GolfCourse,
  GolfTrip,
  TripCourse,
  TripWithCourses,
  LongTrip,
  JourneyStop,
  JourneyStopCourse,
  JourneyStopWithCourses,
  JourneyWithStops,
  CourseImportance,
} from "./types";

/**
 * GTI Airtable access layer
 *
 * Source of truth for:
 * - Trips (GolfTrips)
 * - Courses (GolfCourses)
 * - Trip ↔ Course join (TripCourses)
 *
 * Notes:
 * - Airtable "Link to record" fields return arrays of RECORD IDs, not names.
 * - Ranking logic (Top 100, etc.) must use GolfCourses["Consolidated Ranking"].
 */

// Tables
const LONG_TRIPS_TABLE = "LongTrips";
const STOPS_TABLE = "Stops";
const STOP_COURSES_TABLE = "StopCourses";
const TRIPS_TABLE = "GolfTrips";
const COURSES_TABLE = "GolfCourses";
const TRIP_COURSES_TABLE = "TripCourses";
const ARTICLES_TABLE = "Articles";

// Helpers
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Lazily create/configure Airtable base.
// This prevents accidental import-time failures in builds that touch this file
// without calling Airtable-backed functions.
let _base: Airtable.Base | null = null;
function getBase(): Airtable.Base {
  if (_base) return _base;

  const baseId = requireEnv("AIRTABLE_BASE_ID");
  const apiKey = requireEnv("AIRTABLE_API_KEY");

  Airtable.configure({ apiKey });
  _base = Airtable.base(baseId);
  return _base;
}

function mapTrip(r: Airtable.Record<Airtable.FieldSet>): GolfTrip {
  const f = r.fields;

  const costTier = asNumber(f["Cost Tier"]);
  const stayType = asString(f["Stay Type"]);

  if (!asString(f["Slug"]) || !asString(f["Name"])) {
    throw new Error("Trip missing Slug or Name");
  }
  if (!asNumber(f["Duration Min Days"]) || !asNumber(f["Duration Max Days"])) {
    throw new Error("Trip missing duration fields");
  }
  if (!stayType) throw new Error("Trip missing Stay Type");
  if (costTier == null) throw new Error("Trip missing Cost Tier");

  return {
    id: r.id,
    slug: f["Slug"] as string,
    name: f["Name"] as string,
    secondaryName: asString(f["Secondary Name"]),
    subheader: asString(f["Subheader"]),
    overview: asString(f["Overview"]),
    fullDescription: asString(f["Full Description"]),
    wantMore: asString(f["Want More"]),
    sampleItinerary: asString(f["Sample Itinerary"]),
    sampleItineraryNotes: asString(f["Sample Itinerary Notes"]),
    foodAndLodgingOverview: asString(f["Food and Lodging Overview"]),
    durationMinDays: f["Duration Min Days"] as number,
    durationMaxDays: f["Duration Max Days"] as number,
    driving: asString(f["Driving"]),
    stayType: stayType as any,
    leadTime: asString(f["Lead Time"]),
    costTier: costTier as any,

    golfRating: (asNumber(f["Golf Rating"]) ?? 0) as number,
    lodgingRating: (asNumber(f["Lodging Rating"]) ?? 0) as number,
    foodRating: (asNumber(f["Food Rating"]) ?? 0) as number,
    vibeRating: (asNumber(f["Vibe Rating"]) ?? 0) as number,
    overallRating: (asNumber(f["Overall Rating"]) ?? 0) as number,

    currentRanking: asNumber(f["Current Ranking"]),
    previousRanking: asNumber(f["Previous Ranking"]),

    state: asString(f["State"]),
    region: asString(f["Region"]),
    seasons: Array.isArray(f["Best Seasons"])
      ? (f["Best Seasons"] as string[])
      : undefined,
    hasTop100Course: f["Has Top 100 Course"] === true,

    thumbnailImageUrl: asString(f["Thumbnail Image URL"]),
    heroImageUrl: asString(f["Hero Image URL"]),

    dataDump: asString(f["Data Dump"]),
  };
}

function mapCourse(r: Airtable.Record<Airtable.FieldSet>): GolfCourse {
  const f = r.fields;

  if (!asString(f["Slug"]) || !asString(f["Name"])) {
    throw new Error("Course missing Slug or Name");
  }

  return {
    id: r.id,
    slug: f["Slug"] as string,
    name: f["Name"] as string,
    state: asString(f["State"]),
    courseType: asString(f["Course Type"]),
    dataDump: asString(f["Data Dump"]),

    golfDigestRanking: asNumber(f["Golf Digest Ranking"]),
    golfDotComRanking: asNumber(f["Golfdotcom Ranking"]),
    golfweekRanking: asNumber(f["Golfweek Ranking"]),
    consolidatedRanking: asNumber(f["Consolidated Ranking"]),
  };
}

type TripCourseRow = {
  golfTripId: string;
  golfCourseId: string;
  tripCourseRank: number;
  status: TripCourse["status"];
};

function mapTripCourse(r: Airtable.Record<Airtable.FieldSet>): TripCourseRow {
  const f = r.fields;

  // Airtable "link to record" fields come back as arrays of record IDs
  const tripIds = f["Golf Trip"] as string[] | undefined;
  const courseIds = f["Golf Course"] as string[] | undefined;

  if (!tripIds?.[0] || !courseIds?.[0]) {
    throw new Error("TripCourse missing linked Golf Trip or Golf Course");
  }

  const rank = asNumber(f["Trip Course Rank"]);
  const raw = f["Status"];
  const status =
    Array.isArray(raw) ? (raw[0] ?? "") : typeof raw === "string" ? raw : "";

  if (rank == null) throw new Error("TripCourse missing Trip Course Rank");

  return {
    golfTripId: tripIds[0],
    golfCourseId: courseIds[0],
    tripCourseRank: rank,
    status: status as any,
  };
}

export async function getPublishedTrips(): Promise<GolfTrip[]> {
  const base = getBase();

  const records = await base(TRIPS_TABLE)
    .select({
      filterByFormula: `{Status}="published"`,
      maxRecords: 200,
    })
    .all();

  const trips = records.map(mapTrip);
  return trips.sort(
    (a, b) => (a.currentRanking ?? 999) - (b.currentRanking ?? 999)
  );
}

export async function getPublishedTripBySlug(
  slug: string
): Promise<TripWithCourses | null> {
  const base = getBase();

  const tripFormula = `AND({Status}="published",{Slug}="${slug}")`;

  const tripRecords = await base(TRIPS_TABLE)
    .select({
      filterByFormula: tripFormula,
      maxRecords: 1,
    })
    .all();

  console.log("[getPublishedTripBySlug] slug:", slug);
  console.log("[getPublishedTripBySlug] formula:", tripFormula);
  console.log("[getPublishedTripBySlug] tripRecords:", tripRecords.length);

  const tripRecord = tripRecords[0];
  if (!tripRecord) return null;

  console.log("[getPublishedTripBySlug] tripRecord.id:", tripRecord.id);
  console.log(
    "[getPublishedTripBySlug] tripRecord.fields keys:",
    Object.keys(tripRecord.fields || {})
  );
  console.log("[getPublishedTripBySlug] tripRecord.Status/Slug:", {
    Status: (tripRecord.fields as any)["Status"],
    Slug: (tripRecord.fields as any)["Slug"],
    Name: (tripRecord.fields as any)["Name"],
  });

  const trip = mapTrip(tripRecord);

  // Deterministic join: use the trip's linked TripCourses record IDs
  const tripCourseIds = (tripRecord.fields as any)["TripCourses"] as
    | string[]
    | undefined;

  console.log("[getPublishedTripBySlug] tripRecord TripCourses linked ids:", {
    count: tripCourseIds?.length ?? 0,
    sample: (tripCourseIds || []).slice(0, 5),
  });

  if (!tripCourseIds?.length) {
    return { ...trip, courses: [] };
  }

  // Fetch TripCourses by record IDs (chunked to avoid formula length limits)
  const tcRecords: any[] = [];
  const tcChunkSize = 60;

  for (let i = 0; i < tripCourseIds.length; i += tcChunkSize) {
    const chunk = tripCourseIds.slice(i, i + tcChunkSize);
    const tcFormula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`;

    console.log("[getPublishedTripBySlug] TripCourses chunk formula:", tcFormula);

    const chunkRecords = await base(TRIP_COURSES_TABLE)
      .select({
        filterByFormula: tcFormula,
        maxRecords: 200,
        sort: [{ field: "Trip Course Rank", direction: "asc" }],
      })
      .all();

    tcRecords.push(...chunkRecords);
  }

  console.log("[getPublishedTripBySlug] TripCourses fetched by IDs:", tcRecords.length);

  if (!tcRecords.length) {
    return { ...trip, courses: [] };
  }

  console.log(
    "[getPublishedTripBySlug] TripCourses sample keys:",
    Object.keys(tcRecords[0].fields || {})
  );
  console.log("[getPublishedTripBySlug] TripCourses sample link fields:", {
    "Golf Trip": (tcRecords[0].fields as any)["Golf Trip"],
    "Golf Course": (tcRecords[0].fields as any)["Golf Course"],
    "Trip Course Rank": (tcRecords[0].fields as any)["Trip Course Rank"],
    Status: (tcRecords[0].fields as any)["Status"],
  });

  const tcs = tcRecords
    .map(mapTripCourse)
    .sort((a, b) => a.tripCourseRank - b.tripCourseRank);

  const courseIds = Array.from(new Set(tcs.map((x) => x.golfCourseId))).filter(
    Boolean
  ) as string[];

  console.log("[getPublishedTripBySlug] unique courseIds:", {
    count: courseIds.length,
    sample: courseIds.slice(0, 10),
  });

  if (!courseIds.length) {
    return { ...trip, courses: [] };
  }

  // Fetch courses by IDs (chunk to avoid formula length limits)
  const courseMap = new Map<string, GolfCourse>();
  const chunkSize = 60;

  for (let i = 0; i < courseIds.length; i += chunkSize) {
    const chunk = courseIds.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`;

    console.log("[getPublishedTripBySlug] Courses chunk formula:", formula);

    const courseRecords = await base(COURSES_TABLE)
      .select({
        filterByFormula: formula,
        maxRecords: 200,
      })
      .all();

    console.log("[getPublishedTripBySlug] Courses fetched chunk:", {
      requested: chunk.length,
      returned: courseRecords.length,
    });

    for (const r of courseRecords) {
      courseMap.set(r.id, mapCourse(r));
    }
  }

  const courses = tcs
    .map((tc) => {
      const course = courseMap.get(tc.golfCourseId);
      if (!course) return null;
      return {
        course,
        tripCourseRank: tc.tripCourseRank,
        status: tc.status,
      };
    })
    .filter(Boolean) as TripWithCourses["courses"];

  console.log("[getPublishedTripBySlug] final courses attached:", courses.length);

  return {
    ...trip,
    courses,
  };
}

/**
 * Returns ALL published courses that are Top 100 by Consolidated Ranking.
 * (Consolidated Ranking <= 100)
 */
export async function getPublishedCourses(): Promise<GolfCourse[]> {
  const base = getBase();

  const records = await base(COURSES_TABLE)
    .select({
      filterByFormula: "AND({Consolidated Ranking}, {Consolidated Ranking} <= 100)",
      sort: [{ field: "Consolidated Ranking", direction: "asc" }],
      maxRecords: 500,
    })
    .all();

  return records.map(mapCourse);
}

/**
 * New: For a given trip slug, compute Top 100 courses using Airtable's
 * GolfCourses["Consolidated Ranking"] as the source of truth.
 *
 * Top 100 definition:
 * - consolidatedRanking is a number and <= 100
 */
export async function getTop100CoursesForTripSlug(slug: string): Promise<{
  trip: Pick<GolfTrip, "id" | "slug" | "name">;
  top100Count: number;
  top100Courses: Array<Pick<GolfCourse, "id" | "slug" | "name" | "consolidatedRanking">>;
  excludedNoRankingCount: number;
}> {
  const tripWithCourses = await getPublishedTripBySlug(slug);
  if (!tripWithCourses) {
    throw new Error(`Trip not found (published) for slug: ${slug}`);
  }

  const allCourses = tripWithCourses.courses.map((x) => x.course);

  const withRanking = allCourses.filter(
    (c) => typeof c.consolidatedRanking === "number"
  ) as Array<GolfCourse & { consolidatedRanking: number }>;

  const excludedNoRankingCount = allCourses.length - withRanking.length;

  const top100Courses = withRanking
    .filter((c) => c.consolidatedRanking <= 100)
    .sort((a, b) => (a.consolidatedRanking ?? 9999) - (b.consolidatedRanking ?? 9999))
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      consolidatedRanking: c.consolidatedRanking,
    }));

  return {
    trip: { id: tripWithCourses.id, slug: tripWithCourses.slug, name: tripWithCourses.name },
    top100Count: top100Courses.length,
    top100Courses,
    excludedNoRankingCount,
  };
}

// --- News (unchanged) ---

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapArticles(r: Airtable.Record<Airtable.FieldSet>) {
  const f = r.fields;

  const name = asString(f["Name"]);
  if (!name) throw new Error("News article missing Name");

  const slug = slugify(name);

  return {
    id: r.id,
    slug: asString(f["Slug"]),
    name,
    teaser: asString(f["Teaser"]),
    fullText: asString(f["Full Text"]),
    heroImageUrl: asString(f["HeroImageURL"]),
    imageUrl1: asString(f["ImageURL1"]),
    imageUrl2: asString(f["ImageURL2"]),
    imageUrl3: asString(f["ImageURL3"]),
    imageUrl4: asString(f["ImageURL4"]),
    author: asString(f["Author"]),
    publishedOn: asString(f["Published On"]),
    status: asString(f["Status"]),
  };
}

export async function getLatestPublishedArticles(limit = 3) {
  const base = getBase();

  const records = await base(ARTICLES_TABLE)
    .select({
      filterByFormula: `{Status}="published"`,
      sort: [{ field: "Published On", direction: "desc" }],
      maxRecords: Math.max(1, Math.min(limit, 12)),
    })
    .all();

  return records.map(mapArticles);
}

export type TripWithFirstCourse = GolfTrip & {
  firstCourse?: GolfCourse;
};

export async function getPublishedTripsWithFirstCourse(): Promise<
  TripWithFirstCourse[]
> {
  const base = getBase();

  // 1) Trips
  const tripRecords = await base(TRIPS_TABLE)
    .select({
      filterByFormula: `{Status}="published"`,
      maxRecords: 200,
    })
    .all();

  const trips = tripRecords.map(mapTrip);

  // 2) TripCourses where Trip Course Rank = 1
  const tcRecords = await base(TRIP_COURSES_TABLE)
    .select({
      filterByFormula: `{Trip Course Rank}=1`,
      maxRecords: 2000,
    })
    .all();

  const tcs = tcRecords.map(mapTripCourse);

  // Map tripId -> courseId (rank=1 course)
  const firstCourseIdByTripId = new Map<string, string>();
  for (const tc of tcs) {
    if (!firstCourseIdByTripId.has(tc.golfTripId)) {
      firstCourseIdByTripId.set(tc.golfTripId, tc.golfCourseId);
    }
  }

  // 3) Fetch only those course IDs
  const courseIds = Array.from(new Set(Array.from(firstCourseIdByTripId.values())));
  const courseMap = new Map<string, GolfCourse>();

  const chunkSize = 80;
  for (let i = 0; i < courseIds.length; i += chunkSize) {
    const chunk = courseIds.slice(i, i + chunkSize);

    const courseRecords = await base(COURSES_TABLE)
      .select({
        filterByFormula: `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`,
        maxRecords: 200,
      })
      .all();

    for (const r of courseRecords) {
      courseMap.set(r.id, mapCourse(r));
    }
  }

  // 4) Attach firstCourse onto each trip
  const result: TripWithFirstCourse[] = trips.map((trip) => {
    const firstCourseId = firstCourseIdByTripId.get(trip.id);
    const firstCourse = firstCourseId ? courseMap.get(firstCourseId) : undefined;

    return { ...trip, firstCourse };
  });

  return result.sort((a, b) => (a.currentRanking ?? 999) - (b.currentRanking ?? 999));
}

/**
 * Kept for backward compatibility with your existing usage.
 * Prefer getBase() internally, but this is fine to export.
 */
export function getAirtableBase() {
  return getBase();
}

export async function getTripCourseBreakdownByTripId(tripId: string) {
  const base = getBase();

  const tcRecords = await base(TRIP_COURSES_TABLE)
    .select({
      filterByFormula: `FIND("${tripId}", ARRAYJOIN({Golf Trip}))`,
      maxRecords: 200,
    })
    .all();

  const tcs = tcRecords.map(mapTripCourse).sort((a, b) => a.tripCourseRank - b.tripCourseRank);
  const courseIds = Array.from(new Set(tcs.map((x) => x.golfCourseId)));

  const chunkSize = 80;
  const courseMap = new Map<string, GolfCourse>();

  for (let i = 0; i < courseIds.length; i += chunkSize) {
    const chunk = courseIds.slice(i, i + chunkSize);

    const courseRecords = await base(COURSES_TABLE)
      .select({
        filterByFormula: `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`,
        maxRecords: 200,
      })
      .all();

    for (const r of courseRecords) courseMap.set(r.id, mapCourse(r));
  }

  const byStatus = {
    must_play: [] as GolfCourse[],
    should_play: [] as GolfCourse[],
    want_more: [] as GolfCourse[],
    blank: [] as GolfCourse[],
  };

  for (const tc of tcs) {
    const course = courseMap.get(tc.golfCourseId);
    if (!course) continue;

    const status = (tc.status || "") as string;
    if (status === "must_play") byStatus.must_play.push(course);
    else if (status === "should_play") byStatus.should_play.push(course);
    else if (status === "want_more") byStatus.want_more.push(course);
    else byStatus.blank.push(course);
  }

  return {
    counts: {
      must_play: byStatus.must_play.length,
      should_play: byStatus.should_play.length,
      want_more: byStatus.want_more.length,
      blank: byStatus.blank.length,
      total: tcs.length,
    },
    byStatus,
  };
}

// ================================
//  Journey (Long Trip) functions
// ================================

function mapLongTrip(r: Airtable.Record<Airtable.FieldSet>): LongTrip {
  const f = r.fields;

  if (!asString(f["Slug"]) || !asString(f["Name"])) {
    throw new Error("LongTrip missing Slug or Name");
  }

  return {
    id: r.id,
    slug: f["Slug"] as string,
    name: f["Name"] as string,
    description: asString(f["Description"]),
    fullDescription: asString(f["Full Description"]),
    heroImageUrl: asString(f["Hero Image URL"]),
    durationMinDays: (asNumber(f["Duration Min Days"]) ?? 6) as number,
    durationMaxDays: (asNumber(f["Duration Max Days"]) ?? 10) as number,
    costTier: asNumber(f["Cost Tier"]) as LongTrip["costTier"],
    status: (asString(f["Status"]) ?? "draft") as string,
  };
}

function mapJourneyStop(r: Airtable.Record<Airtable.FieldSet>): JourneyStop {
  const f = r.fields;

  const tripIds = f["Long Trip"] as string[] | undefined;
  if (!tripIds?.[0]) throw new Error("Stop missing linked Long Trip");

  return {
    id: r.id,
    tripId: tripIds[0],
    stopOrder: (asNumber(f["Stop Order"]) ?? 0) as number,
    locationName: (asString(f["Location Name"]) ?? "") as string,
    overnight: f["Overnight"] === true,
    hotels: asString(f["Hotels"]),
    restaurants: asString(f["Restaurants"]),
    bookingAdvice: asString(f["Booking Advice"]),
    notes: asString(f["Notes"]),
  };
}

type StopCourseRow = {
  stopId: string;
  courseId: string;
  importance: CourseImportance;
  notes?: string;
};

function mapStopCourse(r: Airtable.Record<Airtable.FieldSet>): StopCourseRow {
  const f = r.fields;

  const stopIds = f["Stop"] as string[] | undefined;
  const courseIds = f["Golf Course"] as string[] | undefined;

  if (!stopIds?.[0] || !courseIds?.[0]) {
    throw new Error("StopCourse missing linked Stop or Golf Course");
  }

  const raw = f["Importance"];
  const importance = (typeof raw === "string" ? raw : "should_play") as CourseImportance;

  return {
    stopId: stopIds[0],
    courseId: courseIds[0],
    importance,
    notes: asString(f["Notes"]),
  };
}

export async function getPublishedArticles(): Promise<Array<{ slug: string; name: string; publishedOn?: string }>> {
  const base = getBase();
  const records = await base(ARTICLES_TABLE)
    .select({
      filterByFormula: `{Status}="published"`,
      fields: ["Slug", "Name", "Published On"],
      sort: [{ field: "Published On", direction: "desc" }],
      maxRecords: 500,
    })
    .all();
  return records
    .map((r) => ({
      slug: asString(r.fields["Slug"]) ?? "",
      name: asString(r.fields["Name"]) ?? "",
      publishedOn: asString(r.fields["Published On"]),
    }))
    .filter((a) => a.slug);
}

export async function getPublishedJourneys(): Promise<LongTrip[]> {
  const base = getBase();

  const records = await base(LONG_TRIPS_TABLE)
    .select({
      filterByFormula: `{Status}="published"`,
      maxRecords: 100,
    })
    .all();

  return records
    .map(mapLongTrip)
    .sort((a, b) => a.durationMinDays - b.durationMinDays);
}

export async function getPublishedJourneyBySlug(
  slug: string
): Promise<JourneyWithStops | null> {
  const base = getBase();

  const tripRecords = await base(LONG_TRIPS_TABLE)
    .select({
      filterByFormula: `AND({Status}="published",{Slug}="${slug}")`,
      maxRecords: 1,
    })
    .all();

  const tripRecord = tripRecords[0];
  if (!tripRecord) return null;

  const trip = mapLongTrip(tripRecord);

  // Use the linked Stop IDs directly from the trip record
  const linkedStopIds = (tripRecord.fields as any)["Stops"] as string[] | undefined;
  if (!linkedStopIds?.length) {
    return { ...trip, stops: [] };
  }

  const chunkSize = 60;

  // Fetch Stop records by their IDs
  const stopRecords: Airtable.Record<Airtable.FieldSet>[] = [];
  for (let i = 0; i < linkedStopIds.length; i += chunkSize) {
    const chunk = linkedStopIds.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const recs = await base(STOPS_TABLE)
      .select({ filterByFormula: formula, maxRecords: 50 })
      .all();
    stopRecords.push(...recs);
  }

  if (!stopRecords.length) {
    return { ...trip, stops: [] };
  }

  const stops = stopRecords
    .map(mapJourneyStop)
    .sort((a, b) => a.stopOrder - b.stopOrder);

  // Collect all StopCourse IDs from the stop records' linked field
  const allScIds: string[] = [];
  for (const sr of stopRecords) {
    const ids = (sr.fields as any)["StopCourses"] as string[] | undefined;
    if (ids?.length) allScIds.push(...ids);
  }

  // Fetch StopCourses by their IDs (chunked)
  const scRecords: Airtable.Record<Airtable.FieldSet>[] = [];
  for (let i = 0; i < allScIds.length; i += chunkSize) {
    const chunk = allScIds.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`;

    const chunk_records = await base(STOP_COURSES_TABLE)
      .select({ filterByFormula: formula, maxRecords: 200 })
      .all();

    scRecords.push(...chunk_records);
  }

  const stopCourseRows = scRecords.map(mapStopCourse);

  // Collect unique course IDs and fetch them
  const courseIds = Array.from(new Set(stopCourseRows.map((x) => x.courseId)));
  const courseMap = new Map<string, GolfCourse>();

  for (let i = 0; i < courseIds.length; i += chunkSize) {
    const chunk = courseIds.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`;

    const courseRecords = await base(COURSES_TABLE)
      .select({ filterByFormula: formula, maxRecords: 200 })
      .all();

    for (const r of courseRecords) courseMap.set(r.id, mapCourse(r));
  }

  // Assemble stops with their courses
  const stopsWithCourses: JourneyStopWithCourses[] = stops.map((stop) => {
    const courses: JourneyStopCourse[] = stopCourseRows
      .filter((sc) => sc.stopId === stop.id)
      .map((sc) => {
        const course = courseMap.get(sc.courseId);
        if (!course) return null;
        return { stopId: stop.id, course, importance: sc.importance, notes: sc.notes };
      })
      .filter(Boolean) as JourneyStopCourse[];

    return { ...stop, courses };
  });

  return { ...trip, stops: stopsWithCourses };
}
