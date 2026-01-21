import { NextResponse } from "next/server";
import Airtable from "airtable";

export const runtime = "nodejs"; // ensure Node runtime

export async function GET() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  // Never return secrets; only booleans and last-4 for debugging
  const apiKeyLast4 = apiKey ? apiKey.slice(-4) : null;

  if (!baseId || !apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing env var(s)",
        hasBaseId: !!baseId,
        hasApiKey: !!apiKey,
        apiKeyLast4,
      },
      { status: 500 }
    );
  }

  Airtable.configure({ apiKey });
  const base = Airtable.base(baseId);

  try {
    // List 1 record from a known table. Change "GolfTrips" if needed.
    const records = await base("GolfTrips").select({ maxRecords: 1 }).firstPage();
    return NextResponse.json({
      ok: true,
      hasBaseId: true,
      hasApiKey: true,
      apiKeyLast4,
      table: "GolfTrips",
      records: records.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        hasBaseId: true,
        hasApiKey: true,
        apiKeyLast4,
        message: e?.message || String(e),
        status: e?.statusCode || null,
      },
      { status: 500 }
    );
  }
}
