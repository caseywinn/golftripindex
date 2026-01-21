import { NextResponse } from "next/server";
import { getAirtableBase } from "@/lib/airtable";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim();

  const COURSES_TABLE = "GolfCourses"; // <- must match Airtable EXACTLY

  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const base = getAirtableBase();

  const rows = await base(COURSES_TABLE)
    .select({
      maxRecords: 1,
      filterByFormula: `{Slug} = "${slug}"`,
    })
    .firstPage();

  if (rows.length === 0) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const r = rows[0];

  return NextResponse.json(
    {
      course: {
        id: r.id,
        ...r.fields,
      },
    },
    { status: 200 }
  );
}
