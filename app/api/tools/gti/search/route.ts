// src/app/api/tools/gti/search/route.ts
import { NextResponse } from "next/server";
import Airtable from "airtable";
import type { GTISearchHit, GolfTrip, GolfCourse } from "@/lib/types";

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

function escFormula(s: string) {
  // Escape for Airtable formula string literals
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function pickTrip(fields: Record<string, any>, id: string): GTISearchHit | null {
  const name = fields["Name"];
  const slug = fields["Slug"];
  if (!name || !slug) return null;

  // these might not exist in your base; safe-read
  const secondaryName = fields["Secondary Name"] ?? fields["SecondaryName"] ?? fields["Secondary"];
  const costTier = fields["Cost Tier"] ?? fields["costTier"];
  const durationMinDays = fields["Duration Min Days"] ?? fields["durationMinDays"];
  const durationMaxDays = fields["Duration Max Days"] ?? fields["durationMaxDays"];
  const overallRating = fields["Overall Rating"] ?? fields["overallRating"];
  const dataDump = fields["Data Dump"] ?? fields["dataDump"];

  const trip: Pick<
    GolfTrip,
    "id" | "slug" | "name" | "secondaryName" | "costTier" | "durationMinDays" | "durationMaxDays" | "overallRating" | "dataDump"
  > = {
    id,
    slug: String(slug),
    name: String(name),
    secondaryName: secondaryName ? String(secondaryName) : undefined,
    costTier: typeof costTier === "number" ? (costTier as GolfTrip["costTier"]) : (undefined as any),
    durationMinDays: typeof durationMinDays === "number" ? durationMinDays : (undefined as any),
    durationMaxDays: typeof durationMaxDays === "number" ? durationMaxDays : (undefined as any),
    overallRating: typeof overallRating === "number" ? overallRating : (undefined as any),
    dataDump: dataDump ? String(dataDump) : undefined,
  };

  // NOTE: costTier/durationMinDays/durationMaxDays/overallRating are required in your GolfTrip type.
  // If your Airtable doesn't have them yet, you should either:
  // 1) Add those fields, OR
  // 2) Relax your type definition, OR
  // 3) Set sane defaults here (see below).
  //
  // If you want defaults, uncomment these:
  // trip.costTier ??= 3;
  // trip.durationMinDays ??= 2;
  // trip.durationMaxDays ??= 4;
  // trip.overallRating ??= 0;

  return { type: "trip", trip };
}

function pickCourse(fields: Record<string, any>, id: string): GTISearchHit | null {
  const name = fields["Name"];
  const slug = fields["Slug"];
  if (!name || !slug) return null;

  const state = fields["State"] ?? fields["state"];
  const courseType = fields["Course Type"] ?? fields["courseType"];
  const consolidatedRanking = fields["Consolidated Ranking"] ?? fields["consolidatedRanking"];
  const dataDump = fields["Data Dump"] ?? fields["dataDump"];

  const course: Pick<GolfCourse, "id" | "slug" | "name" | "state" | "courseType" | "consolidatedRanking" | "dataDump"> = {
    id,
    slug: String(slug),
    name: String(name),
    state: state ? String(state) : undefined,
    courseType: courseType ? String(courseType) : undefined,
    consolidatedRanking: typeof consolidatedRanking === "number" ? consolidatedRanking : undefined,
    dataDump: dataDump ? String(dataDump) : undefined,
  };

  return { type: "course", course };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const qRaw = (url.searchParams.get("q") || "").trim();

    if (!qRaw) {
      return NextResponse.json({ error: "Missing q" }, { status: 400 });
    }

    // Airtable formula search is basic; keep query small
    const q = qRaw.slice(0, 80);
    const qEsc = escFormula(q.toLowerCase());

    const base = getBase();

    // Update these table names if needed:
    const TRIPS_TABLE = "GolfTrips";
    const COURSES_TABLE = "GolfCourses";

    // Filter formula: case-insensitive substring match in Name or Slug (and Secondary Name for trips, if present)
    const tripFilter = `OR(
      FIND("${qEsc}", LOWER({Name})),
      FIND("${qEsc}", LOWER({Slug})),
      FIND("${qEsc}", LOWER({Secondary Name}))
    )`;

    const courseFilter = `OR(
      FIND("${qEsc}", LOWER({Name})),
      FIND("${qEsc}", LOWER({Slug}))
    )`;

    const [tripRows, courseRows] = await Promise.all([
      base(TRIPS_TABLE)
        .select({
          maxRecords: 10,
          filterByFormula: tripFilter,
        })
        .firstPage(),
      base(COURSES_TABLE)
        .select({
          maxRecords: 10,
          filterByFormula: courseFilter,
        })
        .firstPage(),
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

    return NextResponse.json({ results }, { status: 200 });
  } catch (e: any) {
    console.error("GET /api/tools/gti/search failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
