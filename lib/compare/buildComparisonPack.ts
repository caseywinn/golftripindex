// lib/compare/buildComparisonPack.ts
import Airtable from "airtable";
import stringify from "fast-json-stable-stringify";
import * as crypto from "crypto";

const baseId = process.env.AIRTABLE_BASE_ID!;
const apiKey = process.env.AIRTABLE_API_KEY!;
const TRIPS_TABLE = process.env.AIRTABLE_TRIPS_TABLE || "GolfTrips";
const COURSES_TABLE = process.env.AIRTABLE_COURSES_TABLE || "GolfCourses";
const TRIP_COURSES_TABLE = process.env.AIRTABLE_TRIP_COURSES_TABLE || "TripCourses";

if (!baseId || !apiKey) {
  throw new Error("Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY");
}

Airtable.configure({ apiKey });
const base = Airtable.base(baseId);

// -------------------- type helpers --------------------
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  if (typeof v === "string") return [v];
  return [];
}
function asBoolOrString(v: unknown): boolean | string | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  return null;
}

function clampText(s: string | null, max = 2000): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function hashPack(obj: any): string {
  // stable stringify guarantees deterministic key ordering at all depths
  const json = stringify(obj);
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
}

// -------------------- Airtable fetchers --------------------
async function fetchTripBySlug(slug: string) {
  // NOTE: escape single quotes for Airtable formula strings
  const safeSlug = slug.replace(/'/g, "\\'");
  const res = await base(TRIPS_TABLE)
    .select({
      filterByFormula: `{Slug}='${safeSlug}'`,
      maxRecords: 1,
    })
    .firstPage();

  if (!res?.length) return null;
  return res[0];
}

async function fetchTripCourses(tripRecordId: string) {
  const rows = await base(TRIP_COURSES_TABLE)
    .select({
      filterByFormula: `{Golf Trip}='${tripRecordId}'`,
      sort: [{ field: "Trip Course Rank", direction: "asc" }],
    })
    .all();

  return rows;
}

async function fetchCoursesByIds(courseIds: string[]) {
  if (!courseIds.length) return new Map<string, Airtable.Record<Airtable.FieldSet>>();

  // Airtable formula OR(RECORD_ID()='...', ...) – chunk to avoid huge formulas
  const chunks: string[][] = [];
  for (let i = 0; i < courseIds.length; i += 50) chunks.push(courseIds.slice(i, i + 50));

  const map = new Map<string, Airtable.Record<Airtable.FieldSet>>();
  for (const chunk of chunks) {
    const formula = `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    const recs = await base(COURSES_TABLE).select({ filterByFormula: formula }).all();
    for (const r of recs) map.set(r.id, r);
  }
  return map;
}

// -------------------- pack mapping --------------------
function mapTripPack(
  trip: Airtable.Record<Airtable.FieldSet>,
  tripCourses: ReadonlyArray<Airtable.Record<Airtable.FieldSet>>,
  courseMap: Map<string, Airtable.Record<Airtable.FieldSet>>
) {
  const f: any = trip.fields;

  const courses = tripCourses.map((tc) => {
    const tcf: any = tc.fields;

    const courseId =
      Array.isArray(tcf["Golf Course"]) && typeof tcf["Golf Course"][0] === "string"
        ? (tcf["Golf Course"][0] as string)
        : null;

    const c = courseId ? courseMap.get(courseId) : null;
    const cf: any = c?.fields || {};

    return {
      name: asString(cf["Name"]) || "(Unnamed course)",
      slug: asString(cf["Slug"]) || "",
      trip_course_rank: asNumber(tcf["Trip Course Rank"]),
      architect: asString(cf["Architect"]),
      year_opened: asNumber(cf["Year Opened"]),
      state: asString(cf["State"]),
      course_type: asString(cf["Course Type"]),
      stay_play_required: asBoolOrString(cf["Stay Play Required"]),
      rankings: {
        consolidated: asNumber(cf["Consolidated Ranking"]),
        golf_digest: asNumber(cf["Golf Digest Ranking"]),
        golfdotcom: asNumber(cf["Golfdotcom Ranking"]),
        golfweek: asNumber(cf["Golfweek Ranking"]),
        trend: asString(cf["Trend"]),
      },
    };
  });

  return {
    name: asString(f["Name"]) || "(Unnamed trip)",
    slug: asString(f["Slug"]) || "",
    secondary_name: asString(f["Secondary Name"]),
    subheader: asString(f["Subheader"]),

    overview: clampText(asString(f["Overview"]), 1600),
    full_description: clampText(asString(f["Full Description"]), 2000),
    food_and_lodging_overview: clampText(asString(f["Food and Lodging Overview"]), 2000),
    travel_notes: clampText(asString(f["Travel Notes"]), 2000),
    vibe_summary: clampText(asString(f["Vibe Summary"]), 1200),

    driving: asString(f["Driving"]),
    data_dump: null,

    duration_min_days: asNumber(f["Duration Min Days"]),
    duration_max_days: asNumber(f["Duration Max Days"]),
    stay_type: asString(f["Stay Type"]),
    cost_tier: asNumber(f["Cost Tier"]),
    lead_time: asString(f["Lead Time"]),

    nearest_airports: asStringArray(f["Nearest Airports"]),
    peak_months: asStringArray(f["Peak Months"]),
    shoulder_months: asStringArray(f["Shoulder Months"]),

    ratings: {
      golf: asNumber(f["Golf Rating"]),
      lodging: asNumber(f["Lodging Rating"]),
      food: asNumber(f["Food Rating"]),
      vibe: asNumber(f["Vibe Rating"]),
      beyond_golf: asNumber(f["Beyond Golf Rating"]),
      logistics: asNumber(f["Logistics Rating"]),
      value: asNumber(f["Value Rating"]),
      overall: asNumber(f["Overall Rating"]),
    },

    courses,
  };
}

function normalizeCoursesForSignature(courses: any[]) {
  // Ensure deterministic ordering and trimmed signature fields
  return courses
    .slice()
    .sort((a, b) => (a.trip_course_rank ?? 999) - (b.trip_course_rank ?? 999))
    .map((c) => ({
      slug: c.slug,
      trip_course_rank: c.trip_course_rank,
      architect: c.architect,
      year_opened: c.year_opened,
      rankings: c.rankings,
    }));
}

// -------------------- main entry --------------------
export async function buildComparisonPack(slugA: string, slugB: string) {
  const [tripARec, tripBRec] = await Promise.all([fetchTripBySlug(slugA), fetchTripBySlug(slugB)]);
  if (!tripARec || !tripBRec) return null;

  const [tripACourses, tripBCourses] = await Promise.all([
    fetchTripCourses(tripARec.id),
    fetchTripCourses(tripBRec.id),
  ]);

  const courseIds = [
    ...tripACourses.map((tc: any) => (tc.fields?.["Golf Course"]?.[0] as string) || null),
    ...tripBCourses.map((tc: any) => (tc.fields?.["Golf Course"]?.[0] as string) || null),
  ].filter(Boolean) as string[];

  const courseMap = await fetchCoursesByIds(Array.from(new Set(courseIds)));

  const tripA = mapTripPack(tripARec, tripACourses, courseMap);
  const tripB = mapTripPack(tripBRec, tripBCourses, courseMap);

  // Deterministic cache signature (only include fields that should invalidate cached results)
  const signature = {
    tripA: {
      slug: tripA.slug,
      cost_tier: tripA.cost_tier,
      peak_months: (tripA.peak_months || []).slice().sort(),
      shoulder_months: (tripA.shoulder_months || []).slice().sort(),
      ratings: tripA.ratings,
      courses: normalizeCoursesForSignature(tripA.courses),

      // Include editorial fields if you want cache invalidation when these change
      overview: tripA.overview,
      travel_notes: tripA.travel_notes,
      food_and_lodging_overview: tripA.food_and_lodging_overview,
      vibe_summary: tripA.vibe_summary,
    },
    tripB: {
      slug: tripB.slug,
      cost_tier: tripB.cost_tier,
      peak_months: (tripB.peak_months || []).slice().sort(),
      shoulder_months: (tripB.shoulder_months || []).slice().sort(),
      ratings: tripB.ratings,
      courses: normalizeCoursesForSignature(tripB.courses),

      overview: tripB.overview,
      travel_notes: tripB.travel_notes,
      food_and_lodging_overview: tripB.food_and_lodging_overview,
      vibe_summary: tripB.vibe_summary,
    },
  };

  const data_version = hashPack(signature);

  return {
    generated_at: new Date().toISOString(),
    data_version,
    tripA,
    tripB,
  };
}
