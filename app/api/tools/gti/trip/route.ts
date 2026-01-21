import { NextResponse } from "next/server";
import { getAirtableBase } from "@/lib/airtable";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim();

  const TRIPS_TABLE = "GolfTrips"; // <- must match Airtable EXACTLY

  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const base = getAirtableBase();

  const rows = await base(TRIPS_TABLE)
    .select({
      maxRecords: 1,
      filterByFormula: `{Slug} = "${slug}"`,
    })
    .firstPage();

  if (rows.length === 0) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const r = rows[0];

  return NextResponse.json(
    {
      trip: {
        id: r.id,
        ...r.fields,
      },
    },
    { status: 200 }
  );
}
