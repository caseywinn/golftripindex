/**
 * One-time script: creates the new fields and tables for the redesigned trip detail page.
 * Run with: npx dotenv-cli -e .env.local -- npx tsx scripts/build-airtable-schema.ts
 */
export {};

const API_KEY = process.env.AIRTABLE_API_KEY!;
const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const GOLF_TRIPS_TABLE_ID = "tblrGoUOTP5VnoM2F";

const BASE_URL = "https://api.airtable.com/v0/meta/bases";

function headers() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function addField(tableId: string, field: object) {
  const res = await fetch(`${BASE_URL}/${BASE_ID}/tables/${tableId}/fields`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(field),
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    if (data?.error?.type === "DUPLICATE_FIELD_NAME") {
      console.log(`  ⤷ skipped (already exists): ${(field as any).name}`);
    } else {
      console.error(`  ✗ failed: ${(field as any).name}`, JSON.stringify(data));
    }
  } else {
    console.log(`  ✓ created field: ${data.name}`);
  }
}

async function createTable(name: string, fields: object[]) {
  console.log(`\nCreating table: ${name}`);
  const res = await fetch(`${BASE_URL}/${BASE_ID}/tables`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, fields }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    console.error(`  ✗ failed to create table: ${name}`, JSON.stringify(data));
    return null;
  }
  console.log(`  ✓ created table: ${name} (${data.id})`);
  return data as { id: string; name: string };
}

async function main() {
  if (!API_KEY || !BASE_ID) {
    console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
    process.exit(1);
  }

  // ── 1. New fields on GolfTrips ───────────────────────────────────────────
  console.log("\nAdding fields to GolfTrips...");

  const newGolfTripFields = [
    { name: "Verdict",           type: "multilineText" },
    { name: "Pull Quote",        type: "singleLineText" },
    { name: "Fit Yes",           type: "multilineText" },
    { name: "Fit No",            type: "multilineText" },
    { name: "Lodging",           type: "multilineText" },
    { name: "Dining",            type: "multilineText" },
    { name: "Tee Time Rules",    type: "multilineText" },
    { name: "Common Mistakes",   type: "multilineText" },
    { name: "Pack Bring",        type: "multilineText" },
    { name: "Pack Leave",        type: "multilineText" },
    { name: "Sample Itinerary Notes", type: "multilineText" },
  ];

  for (const field of newGolfTripFields) {
    await addField(GOLF_TRIPS_TABLE_ID, field);
  }

  // ── 2. TripCostRows ──────────────────────────────────────────────────────
  const costTable = await createTable("TripCostRows", [
    { name: "Line",       type: "singleLineText" },
    { name: "Shoulder",   type: "singleLineText" },
    { name: "Peak",       type: "singleLineText" },
    { name: "Optional",   type: "checkbox", options: { icon: "check", color: "yellowBright" } },
    { name: "Sort Order", type: "number", options: { precision: 0 } },
    {
      name: "Golf Trip",
      type: "multipleRecordLinks",
      options: { linkedTableId: GOLF_TRIPS_TABLE_ID },
    },
  ]);

  if (!costTable) {
    console.error("Aborting: TripCostRows creation failed");
    process.exit(1);
  }

  // ── 3. TripSideTrips ─────────────────────────────────────────────────────
  const sideTripsTable = await createTable("TripSideTrips", [
    { name: "Name",       type: "singleLineText" },
    { name: "Slug",       type: "singleLineText" },
    { name: "Text",       type: "multilineText" },
    { name: "Sort Order", type: "number", options: { precision: 0 } },
    {
      name: "Golf Trip",
      type: "multipleRecordLinks",
      options: { linkedTableId: GOLF_TRIPS_TABLE_ID },
    },
  ]);

  if (!sideTripsTable) {
    console.error("Aborting: TripSideTrips creation failed");
    process.exit(1);
  }

  // ── 4. TripItinerary ─────────────────────────────────────────────────────
  const itineraryTable = await createTable("TripItinerary", [
    { name: "Day",        type: "singleLineText" },
    { name: "Schedule",   type: "singleLineText" },
    { name: "Note",       type: "multilineText" },
    {
      name: "Length",
      type: "singleSelect",
      options: {
        choices: [
          { name: "min", color: "blueLight2" },
          { name: "max", color: "greenLight2" },
        ],
      },
    },
    { name: "Sort Order", type: "number", options: { precision: 0 } },
    {
      name: "Golf Trip",
      type: "multipleRecordLinks",
      options: { linkedTableId: GOLF_TRIPS_TABLE_ID },
    },
  ]);

  if (!itineraryTable) {
    console.error("Aborting: TripItinerary creation failed");
    process.exit(1);
  }

  console.log("\n✓ Schema build complete.");
  console.log(`  TripCostRows:   ${costTable.id}`);
  console.log(`  TripSideTrips:  ${sideTripsTable.id}`);
  console.log(`  TripItinerary:  ${itineraryTable.id}`);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
