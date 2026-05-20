/**
 * Fetches all published trips with their cost rows and itineraries,
 * then outputs structured data for pricing analysis.
 *
 * Usage: npx dotenv-cli -e .env.local -- npx tsx scripts/analyze-cost-rows.ts
 */
export {};

const API_KEY = process.env.AIRTABLE_API_KEY!;
const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const BASE = `https://api.airtable.com/v0/${BASE_ID}`;

const TABLES = {
  trips:     "tblrGoUOTP5VnoM2F",
  costRows:  "tblUFRi02u1Y52YXq",
  itinerary: "tbl5BReb1P5Fy6XhQ",
};

function headers() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function fetchAll(table: string, formula: string, fields?: string[]): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({
      filterByFormula: formula,
      maxRecords: "200",
    });
    if (fields) fields.forEach(f => params.append("fields[]", f));
    if (offset) params.set("offset", offset);

    const url = `${BASE}/${table}?${params}`;
    const res = await fetch(url, { headers: headers() });
    const data = await res.json() as any;

    if (!res.ok) throw new Error(`Airtable error: ${JSON.stringify(data)}`);
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return records;
}

async function fetchByIds(table: string, ids: string[], fields?: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  const results: any[] = [];
  const chunkSize = 30;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map(id => `RECORD_ID()="${id}"`).join(",")})`;
    const params = new URLSearchParams({ filterByFormula: formula, maxRecords: "200" });
    if (fields) fields.forEach(f => params.append("fields[]", f));

    const url = `${BASE}/${table}?${params}`;
    const res = await fetch(url, { headers: headers() });
    const data = await res.json() as any;

    if (!res.ok) throw new Error(`Airtable error: ${JSON.stringify(data)}`);
    results.push(...(data.records ?? []));
  }

  return results;
}

async function main() {
  // 1. Fetch all published trips
  const tripRecords = await fetchAll(TABLES.trips, `{Status}="published"`);
  tripRecords.sort((a, b) => (a.fields["Current Ranking"] ?? 999) - (b.fields["Current Ranking"] ?? 999));

  // 2. Collect all cost row IDs and itinerary IDs
  const allCostRowIds: string[] = [];
  const allItineraryIds: string[] = [];

  for (const t of tripRecords) {
    allCostRowIds.push(...((t.fields["TripCostRows"] as string[] | undefined) ?? []));
    allItineraryIds.push(...((t.fields["TripItinerary"] as string[] | undefined) ?? []));
  }

  // 3. Batch-fetch all cost rows and itinerary records
  const [costRowRecords, itineraryRecords] = await Promise.all([
    fetchByIds(TABLES.costRows, [...new Set(allCostRowIds)]),
    fetchByIds(TABLES.itinerary, [...new Set(allItineraryIds)]),
  ]);

  const costRowMap = new Map(costRowRecords.map(r => [r.id, r.fields]));
  const itineraryMap = new Map(itineraryRecords.map(r => [r.id, r.fields]));

  // 4. Build per-trip analysis objects
  const trips = tripRecords.map(t => {
    const f = t.fields;
    const costRowIds: string[] = (f["TripCostRows"] as string[] | undefined) ?? [];
    const itineraryIds: string[] = (f["TripItinerary"] as string[] | undefined) ?? [];

    const costRows = costRowIds
      .map(id => costRowMap.get(id))
      .filter(Boolean)
      .sort((a: any, b: any) => (a["Sort Order"] ?? 0) - (b["Sort Order"] ?? 0))
      .map((r: any) => ({
        line:      (r["Line"] as string) ?? "",
        shoulder:  (r["Shoulder"] as string) ?? "",
        peak:      (r["Peak"] as string) ?? "",
        offSeason: (r["Off-Season"] as string) ?? "",
        optional:  Boolean(r["Optional"]),
      }));

    const allItinerary = itineraryIds
      .map(id => itineraryMap.get(id))
      .filter(Boolean)
      .sort((a: any, b: any) => (a["Sort Order"] ?? 0) - (b["Sort Order"] ?? 0))
      .map((r: any) => ({
        length:   (r["Length"] as string) ?? "",
        day:      (r["Day"] as string) ?? "",
        schedule: (r["Schedule"] as string) ?? "",
        note:     (r["Note"] as string) ?? "",
      }));

    const minItinerary = allItinerary.filter(r => r.length === "min");
    const maxItinerary = allItinerary.filter(r => r.length === "max");

    return {
      slug:        (f["Slug"] as string) ?? t.id,
      name:        (f["Name"] as string) ?? "",
      ranking:     f["Current Ranking"] as number | undefined,
      minDays:     f["Duration Min Days"] as number,
      maxDays:     f["Duration Max Days"] as number,
      costRows,
      minItinerary,
      maxItinerary,
    };
  });

  // 5. Output JSON for analysis
  process.stdout.write(JSON.stringify(trips, null, 2));
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
