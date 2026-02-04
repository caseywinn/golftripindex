import Airtable from "airtable";
import { NextResponse } from "next/server";

const baseId = process.env.AIRTABLE_BASE_ID!;
const apiKey = process.env.AIRTABLE_API_KEY!;
const TRIPS_TABLE = process.env.AIRTABLE_TRIPS_TABLE || "GolfTrips";

Airtable.configure({ apiKey });
const base = Airtable.base(baseId);

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export async function GET() {
  // If you have a specific published value, update this formula.
  // Otherwise remove filterByFormula entirely.
  const filterByFormula = `OR({Status}='published',{Status}='live')`;

  const records = await base(TRIPS_TABLE)
    .select({
      fields: ["Name", "Slug", "Status"],
      filterByFormula,
      sort: [{ field: "Name", direction: "asc" }],
    })
    .all();

  const trips = records
    .map((r: any) => ({
      name: asString(r.fields?.["Name"]) || "",
      slug: asString(r.fields?.["Slug"]) || "",
    }))
    .filter((t) => t.name && t.slug);

  return NextResponse.json({ trips });
}
