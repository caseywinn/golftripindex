/**
 * Validates that each GolfTrip's "Number of Top 100 Courses" field
 * matches the actual count of linked courses with Consolidated Ranking <= 100.
 */

import Airtable from "airtable";
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  process.exit(1);
}

Airtable.configure({ apiKey: AIRTABLE_API_KEY });
const base = Airtable.base(AIRTABLE_BASE_ID);

async function fetchAll(table, options = {}) {
  const records = [];
  await base(table).select({ maxRecords: 2000, ...options }).eachPage((page, next) => {
    records.push(...page);
    next();
  });
  return records;
}

// Slugs for the 46 new trips added by add-trips-46.py
const NEW_TRIP_SLUGS = new Set([
  "cabo-san-lucas-los-cabos","maui","hawaii-big-island","miami-west-palm-beach",
  "kauai","chambers-bay-tacoma","new-jersey-pine-barrens","nemacolin-woodlands",
  "san-antonio","kingsmill-resort","puerto-rico","oahu","orlando","horseshoe-bay",
  "nashville","whistler","denver","sedona","outer-banks","amelia-island",
  "charleston","asheville-blue-ridge","sarasota","naples-marco-island",
  "jackson-hole","gulf-shores-orange-beach","sun-valley","jekyll-island",
  "maine","prince-edward-island","daytona-beach","destin-sandestin","cape-cod",
  "houston-area","whitefish-glacier","hot-springs","vermont","finger-lakes",
  "tennessee-bear-trace-trail","virginia-beach","white-mountains-bretton-woods",
  "eastern-shore-maryland","chicago-area","pocono-mountains",
  "oklahoma-shangri-la","upper-peninsula-sweetgrass",
]);

async function main() {
  console.log("Fetching all trips (any status) for the 46 new slugs...");
  const allTripRecords = await fetchAll("GolfTrips", {
    fields: ["Name", "Slug", "Status", "Number of Top 100 Courses", "TripCourses", "Current Ranking"],
  });

  const tripRecords = allTripRecords.filter(r => NEW_TRIP_SLUGS.has(r.fields["Slug"]));
  tripRecords.sort((a, b) => {
    const na = String(a.fields["Name"] ?? "");
    const nb = String(b.fields["Name"] ?? "");
    return na.localeCompare(nb);
  });

  console.log(`Found ${tripRecords.length} of 46 new trips.\n`);

  // Collect all TripCourse IDs across all trips
  const allTcIds = [];
  for (const tr of tripRecords) {
    const ids = tr.fields["TripCourses"] ?? [];
    allTcIds.push(...ids);
  }

  console.log(`Fetching ${allTcIds.length} TripCourse records in chunks...`);
  const tcMap = new Map(); // tcId -> { golfTripId, golfCourseId }
  const chunkSize = 60;

  for (let i = 0; i < allTcIds.length; i += chunkSize) {
    const chunk = allTcIds.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const recs = await fetchAll("TripCourses", {
      filterByFormula: formula,
      fields: ["Golf Trip", "Golf Course", "Status"],
    });
    for (const r of recs) {
      const tripIds = r.fields["Golf Trip"] ?? [];
      const courseIds = r.fields["Golf Course"] ?? [];
      const raw = r.fields["Status"];
      const status = Array.isArray(raw) ? (raw[0] ?? "") : typeof raw === "string" ? raw : "";
      if (tripIds[0] && courseIds[0]) {
        tcMap.set(r.id, { golfTripId: tripIds[0], golfCourseId: courseIds[0], status });
      }
    }
  }

  // Collect all unique course IDs
  const allCourseIds = Array.from(new Set([...tcMap.values()].map((x) => x.golfCourseId)));
  console.log(`Fetching ${allCourseIds.length} GolfCourse records...`);

  const courseMap = new Map(); // courseId -> { name, consolidatedRanking }

  for (let i = 0; i < allCourseIds.length; i += chunkSize) {
    const chunk = allCourseIds.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const recs = await fetchAll("GolfCourses", {
      filterByFormula: formula,
      fields: ["Name", "Consolidated Ranking"],
    });
    for (const r of recs) {
      courseMap.set(r.id, {
        name: r.fields["Name"],
        consolidatedRanking: r.fields["Consolidated Ranking"] ?? null,
      });
    }
  }

  // Now validate each trip
  console.log("\n" + "=".repeat(90));
  console.log(
    "VALIDATION RESULTS"
  );
  console.log("=".repeat(90));

  const issues = [];
  const allRows = [];

  for (const tr of tripRecords) {
    const tripId = tr.id;
    const tripName = tr.fields["Name"] ?? tr.id;
    const tripStatus = tr.fields["Status"] ?? null;
    const storedCount = tr.fields["Number of Top 100 Courses"] ?? null;
    const tcIds = tr.fields["TripCourses"] ?? [];

    // Find all courses for this trip (all statuses)
    const tripCourseEntries = tcIds
      .map((tcId) => tcMap.get(tcId))
      .filter(Boolean);

    const top100Courses = [];
    for (const tc of tripCourseEntries) {
      const c = courseMap.get(tc.golfCourseId);
      if (c && typeof c.consolidatedRanking === "number" && c.consolidatedRanking <= 100) {
        top100Courses.push(c);
      }
    }

    const actualCount = top100Courses.length;
    const match = storedCount === actualCount;
    const status = match ? "OK" : "MISMATCH";

    allRows.push({
      tripName,
      tripStatus,
      storedCount,
      actualCount,
      match,
      top100Courses: top100Courses.sort((a, b) => a.consolidatedRanking - b.consolidatedRanking),
    });

    if (!match) {
      issues.push({ tripName, storedCount, actualCount, top100Courses });
    }
  }

  // Print summary table
  const nameW = 42;
  const numW = 9;
  const actualW = 9;
  const hdr = `${"Trip".padEnd(nameW)} ${"Stored".padStart(numW)} ${"Actual".padStart(actualW)}  Status`;
  console.log(hdr);
  console.log("-".repeat(hdr.length));

  for (const row of allRows) {
    const storedStr = row.storedCount === null ? "null" : String(row.storedCount);
    const flag = row.match ? "" : " <-- MISMATCH";
    const statusLabel = row.tripStatus ? `[${row.tripStatus}]` : "[no status]";
    console.log(
      `${row.tripName.padEnd(nameW)} ${storedStr.padStart(numW)} ${String(row.actualCount).padStart(actualW)}  ${statusLabel.padEnd(13)}${flag}`
    );
  }

  console.log("\n" + "=".repeat(90));
  if (issues.length === 0) {
    console.log("All trips validated. No mismatches found.");
  } else {
    console.log(`MISMATCHES (${issues.length}):`);
    for (const issue of issues) {
      console.log(`\n  Trip: ${issue.tripName}`);
      console.log(`    Stored: ${issue.storedCount}`);
      console.log(`    Actual: ${issue.actualCount}`);
      if (issue.top100Courses.length > 0) {
        console.log(`    Top 100 courses (Consolidated Ranking <= 100):`);
        for (const c of issue.top100Courses) {
          console.log(`      #${c.consolidatedRanking}  ${c.name}`);
        }
      } else {
        console.log(`    No courses with Consolidated Ranking <= 100 found.`);
      }
    }
  }
  console.log("=".repeat(90));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
