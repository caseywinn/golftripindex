import Airtable from "airtable";
import { GolfCourse, GolfTrip, TripCourse, TripWithCourses } from "./types";

const baseId = process.env.AIRTABLE_BASE_ID;
const apiKey = process.env.AIRTABLE_API_KEY;

if (!baseId || !apiKey) {
  throw new Error("Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY");
}

Airtable.configure({ apiKey });
const base = Airtable.base(baseId);

const TRIPS_TABLE = "GolfTrips";
const COURSES_TABLE = "GolfCourses";
const TRIP_COURSES_TABLE = "TripCourses";
const NEWS_TABLE = "Articles"; // change to your actual table name if different

// Helpers
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
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
  if (!costTier) throw new Error("Trip missing Cost Tier");

  return {
    id: r.id,
    slug: f["Slug"] as string,
    name: f["Name"] as string,
    secondaryName: asString(f["Secondary Name"]),
    overview: asString(f["Overview"]),
    fullDescription: asString(f["Full Description"]),
    sampleItinerary: asString(f["Sample Itinerary"]),
    sampleItineraryNotes: asString(f["Sample Itinerary Notes"]),
    foodAndLodgingOverview: asString(f["Food and Lodging Overview"]),
    durationMinDays: f["Duration Min Days"] as number,
    durationMaxDays: f["Duration Max Days"] as number,
    driving: asNumber(f["Driving"]),
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

    thumbnailImageUrl: asString(f["Thumbnail Image URL"]),
    heroImageUrl: asString(f["Hero Image URL"]),
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
  const status = asString(f["Status"]);

  if (!rank) throw new Error("TripCourse missing Trip Course Rank");
  if (!status) throw new Error("TripCourse missing Status");

  return {
    golfTripId: tripIds[0],
    golfCourseId: courseIds[0],
    tripCourseRank: rank,
    status: status as any,
  };
}

export async function getPublishedTrips(): Promise<GolfTrip[]> {
  const records = await base(TRIPS_TABLE)
    .select({
      filterByFormula: `{Status}="published"`,
      maxRecords: 200,
    })
    .all();

  const trips = records.map(mapTrip);

  return trips.sort((a, b) => (a.currentRanking ?? 999) - (b.currentRanking ?? 999));
}

export async function getPublishedTripBySlug(slug: string): Promise<TripWithCourses | null> {
  const tripRecords = await base(TRIPS_TABLE)
    .select({
      filterByFormula: `AND({Status}="published",{Slug}="${slug}")`,
      maxRecords: 1,
    })
    .all();

  const tripRecord = tripRecords[0];
  if (!tripRecord) return null;

  const trip = mapTrip(tripRecord);
  const safeTripName = trip.name.replaceAll('"', '\\"');

  const tcRecords = await base(TRIP_COURSES_TABLE)
    .select({
      filterByFormula: `FIND("${safeTripName}", ARRAYJOIN({Golf Trip}))`,
      maxRecords: 50,
   })
  .all();

  const tcs = tcRecords.map(mapTripCourse).sort((a, b) => a.tripCourseRank - b.tripCourseRank);
  const courseIds = Array.from(new Set(tcs.map((x) => x.golfCourseId)));

  const courseRecords = await base(COURSES_TABLE)
    .select({
      filterByFormula: `OR(${courseIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`,
      maxRecords: 200,
    })
    .all();

  const courseMap = new Map(courseRecords.map((r) => [r.id, mapCourse(r)]));

  return {
    ...trip,
    courses: tcs
      .map((tc) => {
        const course = courseMap.get(tc.golfCourseId);
        if (!course) return null;
        return {
          course,
          tripCourseRank: tc.tripCourseRank,
          status: tc.status,
        };
      })
      .filter(Boolean) as TripWithCourses["courses"],
  };
}

export async function getPublishedCourses() {
  const records = await base(COURSES_TABLE)
    .select({
      filterByFormula: "AND({Consolidated Ranking}, {Consolidated Ranking} <= 100)",
      sort: [{ field: "Consolidated Ranking", direction: "asc" }],
    })
    .all();

  return records.map((r) => {
    const f = r.fields;

    return {
      id: r.id,
      slug: f["Slug"] as string,
      name: f["Name"] as string,
      state: asString(f["State"]),
      courseType: asString(f["Course Type"]),

      golfDigestRanking: asNumber(f["Golf Digest Ranking"]),
      golfDotComRanking: asNumber(f["Golfdotcom Ranking"]),
      golfweekRanking: asNumber(f["Golfweek Ranking"]),
      consolidatedRanking: asNumber(f["Consolidated Ranking"]),
    };
  });
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapNews(r: Airtable.Record<Airtable.FieldSet>) {
  const f = r.fields;

  const name = asString(f["Name"]);
  if (!name) throw new Error("News article missing Name");

  // Prefer an explicit Slug field if you later add one; for now derive from Name.
  const slug = slugify(name);

  return {
    id: r.id,
    slug,
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

export async function getLatestPublishedNews(limit = 3) {
  const records = await base(NEWS_TABLE)
    .select({
      filterByFormula: `{Status}="published"`,
      sort: [{ field: "Published On", direction: "desc" }],
      maxRecords: Math.max(1, Math.min(limit, 12)),
    })
    .all();

  return records.map(mapNews);
}
