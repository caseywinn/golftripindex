// src/lib/gti.ts
import Airtable from "airtable";
import type { GTISearchHit, GolfTrip, GolfCourse } from "@/lib/types";

type TripCourseStatus = "must_play" | "should_play" | "want_more" | null;

export type TripDetail = {
  trip: {
    id: string;
    slug: string;
    name: string;
    secondaryName?: string;
    fullDescription?: string;
    wantMore?: string;
    foodAndLodgingOverview?: string;
    leadTime?: string;
    costTier?: number;
    durationMinDays?: number;
    durationMaxDays?: number;
    dataDump?: string;
  };
  courses: {
    must_play: GolfCourse[];
    should_play: GolfCourse[];
    want_more: GolfCourse[];
    unknown: GolfCourse[];
  };
};

export type AnchorResolution =
  | { kind: "trip"; trip: { id: string; slug: string; name: string } }
  | { kind: "course"; course: { id: string; slug: string; name: string; state?: string } }
  | { kind: "state"; state: string }
  | { kind: "none" };

export type TripRatingMetric = "overall" | "vibe" | "food" | "lodging" | "golf";

export type RatedTripSummary = {
  id: string;
  slug: string;
  name: string;
  secondaryName?: string;
  leadTime?: string;
  costTier?: number;
  durationMinDays?: number;
  durationMaxDays?: number;

  overallRating?: number;
  vibeRating?: number;
  foodRating?: number;
  lodgingRating?: number;
  golfRating?: number;
};

function metricField(metric: TripRatingMetric) {
  switch (metric) {
    case "overall":
      return F.Trip.OverallRating;
    case "vibe":
      return F.Trip.VibeRating;
    case "food":
      return F.Trip.FoodRating;
    case "lodging":
      return F.Trip.LodgingRating;
    case "golf":
      return F.Trip.GolfRating;
    default:
      return F.Trip.OverallRating;
  }
}

// -------------------- env / airtable --------------------

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function getBase() {
  const apiKey = requireEnv("AIRTABLE_API_KEY");
  const baseId = requireEnv("AIRTABLE_BASE_ID");
  return new Airtable({ apiKey }).base(baseId);
}

const DEBUG = process.env.GTI_DEBUG === "1";
function dlog(...args: any[]) {
  if (DEBUG) console.log("[gti]", ...args);
}

function escFormula(s: string) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function asString(v: any): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normalize(s: string) {
  return String(s ?? "").trim().toLowerCase();
}

function safeNumberish(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// In your app, costTier is commonly typed 1|2|3|4|5. We coerce into that.
type CostTier = GolfTrip["costTier"];
function safeCostTier(v: any, fallback: 1 | 2 | 3 | 4 | 5 = 3): CostTier {
  const n = safeNumberish(v);
  if (!n) return fallback as CostTier;
  const r = Math.round(n);
  const c = Math.min(5, Math.max(1, r)) as 1 | 2 | 3 | 4 | 5;
  return c as CostTier;
}

// -------------------- airtable schema (adjust to your base labels) --------------------

const TRIPS_TABLE = "GolfTrips";
const COURSES_TABLE = "GolfCourses";
const TRIP_COURSES_TABLE = "TripCourses";

const F = {
  Trip: {
    Name: "Name",
    Slug: "Slug",
    SecondaryName: "Secondary Name",
    FullDescription: "Full Description",
    WantMore: "Want More",
    LeadTime: "Lead Time",
    FoodAndLodging: "Food and Lodging Overview",
    CurrentRanking: "Current Ranking",
    GolfRating: "Golf Rating",
    LodgingRating: "Lodging Rating",
    FoodRating: "Food Rating",
    VibeRating: "Vibe Rating",
    OverallRating: "Overall Rating",
    CostTier: "Cost Tier",
    DurationMin: "Duration Min Days",
    DurationMax: "Duration Max Days",
    DataDump: "Data Dump",
  },
  Course: {
    Name: "Name",
    Slug: "Slug",
    State: "State",
    CourseType: "Course Type",
    ConsolidatedRanking: "Consolidated Ranking",
    DataDump: "Data Dump",
  },
  TripCourse: {
    GolfTrip: "Golf Trip", // linked record OR lookup; we handle both
    GolfCourse: "Golf Course", // linked record to GolfCourses
    Status: "Status",
  },
};

// -------------------- search hit mapping --------------------

function isTripHit(h: GTISearchHit): h is Extract<GTISearchHit, { type: "trip" }> {
  return h.type === "trip";
}
function isCourseHit(h: GTISearchHit): h is Extract<GTISearchHit, { type: "course" }> {
  return h.type === "course";
}

function pickTrip(fields: Record<string, any>, id: string): GTISearchHit | null {
  const name = fields[F.Trip.Name];
  const slug = fields[F.Trip.Slug];
  if (!name || !slug) return null;

  const secondaryName = fields[F.Trip.SecondaryName];

  const trip: Pick<
    GolfTrip,
    | "id"
    | "slug"
    | "name"
    | "secondaryName"
    | "fullDescription"
    | "wantMore"
    | "foodAndLodgingOverview"
    | "currentRanking"
    | "golfRating"
    | "lodgingRating"
    | "foodRating"
    | "vibeRating"
    | "overallRating"
    | "costTier"
    | "durationMinDays"
    | "durationMaxDays"
    | "dataDump"
  > = {
    id,
    slug: String(slug),
    name: String(name),
    secondaryName: secondaryName ? String(secondaryName) : undefined,

    fullDescription: asString(fields[F.Trip.FullDescription]),
    wantMore: asString(fields[F.Trip.WantMore]),
    foodAndLodgingOverview: asString(fields[F.Trip.FoodAndLodging]),
    dataDump: asString(fields[F.Trip.DataDump]),

    // If these are required in your GolfTrip type, they must be numbers (not undefined)
    currentRanking: safeNumberish(fields[F.Trip.CurrentRanking]) ?? 0,
    golfRating: safeNumberish(fields[F.Trip.GolfRating]) ?? 0,
    lodgingRating: safeNumberish(fields[F.Trip.LodgingRating]) ?? 0,
    foodRating: safeNumberish(fields[F.Trip.FoodRating]) ?? 0,
    vibeRating: safeNumberish(fields[F.Trip.VibeRating]) ?? 0,
    overallRating: safeNumberish(fields[F.Trip.OverallRating]) ?? 0,

    costTier: safeCostTier(fields[F.Trip.CostTier], 3),
    durationMinDays: safeNumberish(fields[F.Trip.DurationMin]) ?? 2,
    durationMaxDays: safeNumberish(fields[F.Trip.DurationMax]) ?? 4,
  };

  return { type: "trip", trip };
}

function pickCourse(fields: Record<string, any>, id: string): GTISearchHit | null {
  const name = fields[F.Course.Name];
  const slug = fields[F.Course.Slug];
  if (!name || !slug) return null;

  const course: Pick<
    GolfCourse,
    "id" | "slug" | "name" | "state" | "courseType" | "consolidatedRanking" | "dataDump"
  > = {
    id,
    slug: String(slug),
    name: String(name),
    state: fields[F.Course.State] ? String(fields[F.Course.State]) : undefined,
    courseType: fields[F.Course.CourseType] ? String(fields[F.Course.CourseType]) : undefined,
    consolidatedRanking: safeNumberish(fields[F.Course.ConsolidatedRanking]),
    dataDump: asString(fields[F.Course.DataDump]),
  };

  return { type: "course", course };
}

// -------------------- query normalization (critical for sentences) --------------------

function extractSearchNeedle(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";

  const m =
    s.match(/\bnear\s+([A-Za-z0-9'’.\- ]{3,60})/i) ||
    s.match(/\babout\s+([A-Za-z0-9'’.\- ]{3,60})/i) ||
    s.match(/\bat\s+([A-Za-z0-9'’.\- ]{3,60})/i) ||
    s.match(/\bin\s+([A-Za-z0-9'’.\- ]{3,60})/i);

  if (m?.[1]) return m[1].trim();

  if (s.length <= 40) return s;

  const words = s
    .replace(/[^\w\s'’.\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return words.slice(-4).join(" ");
}

// -------------------- public exports --------------------

export async function gtiSearch(query: string): Promise<GTISearchHit[]> {
  const qRaw = (query || "").trim();
  if (!qRaw) return [];

  const needle = extractSearchNeedle(qRaw);
  const q = needle.slice(0, 60).toLowerCase();
  if (!q) return [];

  const qEsc = escFormula(q);
  const base = getBase();

  // NOTE: If {Secondary Name} does not exist in your base, remove that FIND line.
  const tripFilter = `OR(
    FIND("${qEsc}", LOWER({${F.Trip.Name}})),
    FIND("${qEsc}", LOWER({${F.Trip.Slug}})),
    FIND("${qEsc}", LOWER({${F.Trip.SecondaryName}}))
  )`;

  const courseFilter = `OR(
    FIND("${qEsc}", LOWER({${F.Course.Name}})),
    FIND("${qEsc}", LOWER({${F.Course.Slug}}))
  )`;

  const [tripRows, courseRows] = await Promise.all([
    base(TRIPS_TABLE).select({ maxRecords: 10, filterByFormula: tripFilter }).firstPage(),
    base(COURSES_TABLE).select({ maxRecords: 10, filterByFormula: courseFilter }).firstPage(),
  ]);

  const results: GTISearchHit[] = [];
  for (const r of tripRows) {
    const hit = pickTrip(r.fields as any, r.id);
    if (hit) results.push(hit);
  }
  for (const r of courseRows) {
    const hit = pickCourse(r.fields as any, r.id);
    if (hit) results.push(hit);
  }

  dlog("gtiSearch", { qRaw, needle, trips: tripRows.length, courses: courseRows.length });
  return results;
}

export async function gtiResolveAnchor(query: string): Promise<AnchorResolution> {
  const qFull = normalize(query);
  if (!qFull) return { kind: "none" };

  // State abbreviation detection
  const m = qFull.match(
    /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/i
  );
  if (m?.[1]) return { kind: "state", state: m[1].toUpperCase() };

  // Use needle extraction so sentences anchor correctly
  const needle = extractSearchNeedle(qFull);
  const hits = await gtiSearch(needle);

  const tripHit = hits.find(isTripHit);
  if (tripHit) {
    return { kind: "trip", trip: { id: tripHit.trip.id, slug: tripHit.trip.slug, name: tripHit.trip.name } };
  }

  const courseHit = hits.find(isCourseHit);
  if (courseHit) {
    return {
      kind: "course",
      course: {
        id: courseHit.course.id,
        slug: courseHit.course.slug,
        name: courseHit.course.name,
        state: courseHit.course.state,
      },
    };
  }

  return { kind: "none" };
}

export async function getTripBySlug(slug: string) {
  const s = normalize(slug || "");
  if (!s) return null;

  const base = getBase();
  const rows = await base(TRIPS_TABLE)
    .select({ maxRecords: 1, filterByFormula: `{${F.Trip.Slug}} = "${escFormula(s)}"` })
    .firstPage();

  if (!rows.length) return null;

  const r = rows[0];
  const f: any = r.fields;

  return {
    id: r.id,
    slug: String(f[F.Trip.Slug]),
    name: String(f[F.Trip.Name]),
    secondaryName: asString(f[F.Trip.SecondaryName]),
    fullDescription: asString(f[F.Trip.FullDescription]),
    wantMore: asString(f[F.Trip.WantMore]),
    foodAndLodgingOverview: asString(f[F.Trip.FoodAndLodging]),
    leadTime: asString(f[F.Trip.LeadTime]),
    costTier: safeNumberish(f[F.Trip.CostTier]),
    durationMinDays: safeNumberish(f[F.Trip.DurationMin]),
    durationMaxDays: safeNumberish(f[F.Trip.DurationMax]),
    dataDump: asString(f[F.Trip.DataDump]),
  };
}

export async function getTripByNameLike(name: string) {
  const q = normalize(name || "");
  if (!q) return null;

  const base = getBase();
  const qEsc = escFormula(q);

  const filter = `OR(
    FIND("${qEsc}", LOWER({${F.Trip.Name}})),
    FIND("${qEsc}", LOWER({${F.Trip.SecondaryName}}))
  )`;

  const rows = await base(TRIPS_TABLE).select({ maxRecords: 1, filterByFormula: filter }).firstPage();
  if (!rows.length) return null;

  const slug = String((rows[0].fields as any)[F.Trip.Slug] ?? "");
  return slug ? getTripBySlug(slug) : null;
}

function extractLinkedIds(v: any): string[] {
  // Airtable SDK usually returns linked record IDs as string[] for linked fields.
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string") return [v];
  return [];
}

async function getTripCourseLinks(tripRecordId: string, tripName: string) {
  const base = getBase();

  // Pass 1: filter by record id (best case: linked field contains record IDs)
  const filterById = `FIND("${escFormula(tripRecordId)}", ARRAYJOIN({${F.TripCourse.GolfTrip}}))`;
  let rows = await base(TRIP_COURSES_TABLE)
    .select({ maxRecords: 200, filterByFormula: filterById })
    .firstPage();

  // Pass 2: if 0 rows, try filtering by trip name (if TripCourses stores names / lookup)
  if (!rows.length && tripName) {
    const tn = escFormula(tripName);
    const filterByName = `FIND("${tn}", ARRAYJOIN({${F.TripCourse.GolfTrip}}))`;
    rows = await base(TRIP_COURSES_TABLE)
      .select({ maxRecords: 200, filterByFormula: filterByName })
      .firstPage();
  }

  dlog("TripCourses rows", { tripRecordId, tripName, rows: rows.length });

  const grouped: Record<"must_play" | "should_play" | "want_more" | "unknown", string[]> = {
    must_play: [],
    should_play: [],
    want_more: [],
    unknown: [],
  };

  for (const r of rows) {
    const f: any = r.fields;
    const statusRaw = (f[F.TripCourse.Status] ?? null) as TripCourseStatus;
    const courseLinked = f[F.TripCourse.GolfCourse];
    const courseIds = extractLinkedIds(courseLinked);

    const bucket =
      statusRaw === "must_play"
        ? "must_play"
        : statusRaw === "should_play"
        ? "should_play"
        : statusRaw === "want_more"
        ? "want_more"
        : "unknown";

    grouped[bucket].push(...courseIds);
  }

  for (const k of Object.keys(grouped) as Array<keyof typeof grouped>) {
    grouped[k] = Array.from(new Set(grouped[k]));
  }

  return grouped;
}

export async function getCoursesByIds(courseRecordIds: string[]) {
  const ids = (courseRecordIds || []).filter(Boolean);
  if (!ids.length) return [];

  const base = getBase();
  const clauses = ids.slice(0, 60).map((id) => `RECORD_ID()="${escFormula(id)}"`);
  const filter = `OR(${clauses.join(",")})`;

  const rows = await base(COURSES_TABLE)
    .select({ maxRecords: 200, filterByFormula: filter })
    .firstPage();

  const courses: GolfCourse[] = [];
  for (const r of rows) {
    const f: any = r.fields;
    const name = f[F.Course.Name];
    const slug = f[F.Course.Slug];
    if (!name || !slug) continue;

    courses.push({
      id: r.id,
      slug: String(slug),
      name: String(name),
      state: asString(f[F.Course.State]),
      courseType: asString(f[F.Course.CourseType]),
      consolidatedRanking: safeNumberish(f[F.Course.ConsolidatedRanking]),
      dataDump: asString(f[F.Course.DataDump]),
    } as any);
  }

  return courses;
}

export async function getTripDetailBySlug(slug: string): Promise<TripDetail | null> {
  const trip = await getTripBySlug(slug);
  if (!trip) return null;

  const groupedIds = await getTripCourseLinks(trip.id, trip.name);

  const [must, should, want, unk] = await Promise.all([
    getCoursesByIds(groupedIds.must_play),
    getCoursesByIds(groupedIds.should_play),
    getCoursesByIds(groupedIds.want_more),
    getCoursesByIds(groupedIds.unknown),
  ]);

  return {
    trip: {
      id: trip.id,
      slug: trip.slug,
      name: trip.name,
      secondaryName: trip.secondaryName,
      fullDescription: trip.fullDescription,
      wantMore: trip.wantMore,
      foodAndLodgingOverview: trip.foodAndLodgingOverview,
      leadTime: trip.leadTime,
      costTier: trip.costTier,
      durationMinDays: trip.durationMinDays,
      durationMaxDays: trip.durationMaxDays,
      dataDump: trip.dataDump,
    },
    courses: {
      must_play: must,
      should_play: should,
      want_more: want,
      unknown: unk,
    },
  };
}

export async function getCoursesByState(state: string): Promise<GolfCourse[]> {
  const st = String(state || "").trim().toUpperCase();
  if (!st) return [];

  const base = getBase();
  const rows = await base(COURSES_TABLE)
    .select({ maxRecords: 50, filterByFormula: `{${F.Course.State}} = "${escFormula(st)}"` })
    .firstPage();

  const out: GolfCourse[] = [];
  for (const r of rows) {
    const hit = pickCourse(r.fields as any, r.id);
    if (hit?.type === "course") out.push(hit.course as any);
  }
  return out;
}

export type Top100TripCount = {
  tripId: string;
  tripSlug: string;
  tripName: string;
  top100Count: number;
  top100Courses: Array<{ courseId: string; courseName: string; consolidatedRanking?: number }>;
};

export async function getTripsTop100Counts(opts?: { limitTrips?: number; limitCourses?: number }) {
  const base = getBase();

  // 1) Pull all trips (or cap)
  const tripRows = await base(TRIPS_TABLE)
    .select({ maxRecords: opts?.limitTrips ?? 200 })
    .firstPage();

  const trips = tripRows
    .map((r) => {
      const f: any = r.fields;
      const name = f[F.Trip.Name];
      const slug = f[F.Trip.Slug];
      if (!name || !slug) return null;
      return { id: r.id, slug: String(slug), name: String(name) };
    })
    .filter(Boolean) as Array<{ id: string; slug: string; name: string }>;

  // 2) Pull all courses that are Top 100 (Consolidated Ranking <= 100)
  // Airtable filter: {Consolidated Ranking} <= 100
  const top100CourseRows = await base(COURSES_TABLE)
    .select({
      maxRecords: opts?.limitCourses ?? 500,
      filterByFormula: `AND(
        {${F.Course.ConsolidatedRanking}} > 0,
        {${F.Course.ConsolidatedRanking}} <= 100
      )`,
    })
    .firstPage();

  const top100CourseById = new Map<
    string,
    { id: string; name: string; consolidatedRanking?: number }
  >();

  for (const r of top100CourseRows) {
    const f: any = r.fields;
    const name = f[F.Course.Name];
    if (!name) continue;
    top100CourseById.set(r.id, {
      id: r.id,
      name: String(name),
      consolidatedRanking: safeNumberish(f[F.Course.ConsolidatedRanking]),
    });
  }

  // 3) Pull TripCourses and count Top 100 per trip
  // We fetch a larger set and compute client-side.
  const tripCourseRows = await base(TRIP_COURSES_TABLE)
    .select({ maxRecords: 2000 })
    .firstPage();

  // Map tripId -> set(courseId)
  const top100ByTrip = new Map<string, Set<string>>();

  for (const r of tripCourseRows) {
    const f: any = r.fields;
    const tripLinked = f[F.TripCourse.GolfTrip];
    const courseLinked = f[F.TripCourse.GolfCourse];

    const tripIds = Array.isArray(tripLinked) ? tripLinked.filter((x: any) => typeof x === "string") : [];
    const courseIds = Array.isArray(courseLinked) ? courseLinked.filter((x: any) => typeof x === "string") : [];

    if (!tripIds.length || !courseIds.length) continue;

    for (const tId of tripIds) {
      for (const cId of courseIds) {
        if (!top100CourseById.has(cId)) continue;
        if (!top100ByTrip.has(tId)) top100ByTrip.set(tId, new Set());
        top100ByTrip.get(tId)!.add(cId);
      }
    }
  }

  const tripIndex = new Map(trips.map((t) => [t.id, t]));
  const out: Top100TripCount[] = [];

  for (const [tripId, courseSet] of top100ByTrip.entries()) {
    const t = tripIndex.get(tripId);
    if (!t) continue;
    const courseList = Array.from(courseSet)
      .map((cid) => top100CourseById.get(cid)!)
      .filter(Boolean)
      .sort((a, b) => (a.consolidatedRanking ?? 9999) - (b.consolidatedRanking ?? 9999));

    out.push({
      tripId,
      tripSlug: t.slug,
      tripName: t.name,
      top100Count: courseList.length,
      top100Courses: courseList.map((c) => ({
        courseId: c.id,
        courseName: c.name,
        consolidatedRanking: c.consolidatedRanking,
      })),
    });
  }

  out.sort((a, b) => b.top100Count - a.top100Count);
  return out;
}

function parseNumberish(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return undefined;

    // Handle "8/10", "8.5 / 10", "Rating: 9", etc.
    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return undefined;

    const n = Number(m[0]);
    return Number.isFinite(n) ? n : undefined;
  }

  return undefined;
}

export async function getTopTripsByRating(
  metric: TripRatingMetric,
  limit = 5
): Promise<RatedTripSummary[]> {
  const base = getBase();

  // Fetch all trips (handles >100 records)
  const rows = await base(TRIPS_TABLE)
    .select({ pageSize: 100 })
    .all();

  // Optional one-time sanity log (comment out after confirming)
  // console.log("[getTopTripsByRating] sample trip fields keys:", Object.keys(rows[0]?.fields ?? {}));
  // console.log("[getTopTripsByRating] sample ratings raw:", {
  //   overall: (rows[0]?.fields as any)?.[F.Trip.OverallRating],
  //   vibe: (rows[0]?.fields as any)?.[F.Trip.VibeRating],
  //   food: (rows[0]?.fields as any)?.[F.Trip.FoodRating],
  //   lodging: (rows[0]?.fields as any)?.[F.Trip.LodgingRating],
  //   golf: (rows[0]?.fields as any)?.[F.Trip.GolfRating],
  // });

  const trips: RatedTripSummary[] = rows
    .map((r) => {
      const f: any = r.fields;
      const name = f[F.Trip.Name];
      const slug = f[F.Trip.Slug];
      if (!name || !slug) return null;

      const out: RatedTripSummary = {
        id: r.id,
        slug: String(slug),
        name: String(name),
        secondaryName: asString(f[F.Trip.SecondaryName]),
        leadTime: asString(f[F.Trip.LeadTime]),
        costTier: parseNumberish(f[F.Trip.CostTier]),
        durationMinDays: parseNumberish(f[F.Trip.DurationMin]),
        durationMaxDays: parseNumberish(f[F.Trip.DurationMax]),

        overallRating: parseNumberish(f[F.Trip.OverallRating]),
        vibeRating: parseNumberish(f[F.Trip.VibeRating]),
        foodRating: parseNumberish(f[F.Trip.FoodRating]),
        lodgingRating: parseNumberish(f[F.Trip.LodgingRating]),
        golfRating: parseNumberish(f[F.Trip.GolfRating]),
      };

      return out;
    })
    .filter(Boolean) as RatedTripSummary[];

  const getMetric = (t: RatedTripSummary) => {
    switch (metric) {
      case "overall":
        return t.overallRating ?? 0;
      case "vibe":
        return t.vibeRating ?? 0;
      case "food":
        return t.foodRating ?? 0;
      case "lodging":
        return t.lodgingRating ?? 0;
      case "golf":
        return t.golfRating ?? 0;
      default:
        return t.overallRating ?? 0;
    }
  };

  trips.sort((a, b) => {
    const d = getMetric(b) - getMetric(a);
    if (d !== 0) return d;
    const o = (b.overallRating ?? 0) - (a.overallRating ?? 0);
    if (o !== 0) return o;
    return (b.vibeRating ?? 0) - (a.vibeRating ?? 0);
  });

  // Prefer trips with an actual metric value; if none, fall back to the sorted list
  const top = trips.filter((t) => getMetric(t) > 0).slice(0, limit);
  return top.length ? top : trips.slice(0, limit);
}
