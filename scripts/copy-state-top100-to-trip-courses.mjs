/**
 * Copies "State Top 100" from GolfCourses → TripCourses.
 *
 * A single course can appear in multiple TripCourse rows (one per trip),
 * so each matching TripCourse row gets the value.
 *
 * Run:
 *   node scripts/copy-state-top100-to-trip-courses.mjs
 *   node scripts/copy-state-top100-to-trip-courses.mjs --dry-run
 */

import Airtable from "airtable";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

Airtable.configure({ apiKey: process.env.AIRTABLE_API_KEY });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  // 1. Fetch all GolfCourse records that have a "State Top 100" value
  console.log("Fetching GolfCourses with State Top 100...");
  const courseRecords = await base("GolfCourses")
    .select({
      fields: ["Name", "State Top 100"],
      maxRecords: 2000,
    })
    .all();

  if (!courseRecords.length) {
    console.log("No courses found with State Top 100 set. Exiting.");
    return;
  }

  // courseId -> stateTop100 value (skip any that came back null/undefined)
  const stateTop100ByCourseId = new Map();
  for (const r of courseRecords) {
    const val = r.fields["State Top 100"];
    if (val == null) continue;
    stateTop100ByCourseId.set(r.id, val);
  }

  console.log(`Found ${stateTop100ByCourseId.size} course(s) with a State Top 100 value (out of ${courseRecords.length} fetched).\n`);
  for (const [id, val] of stateTop100ByCourseId) {
    const name = courseRecords.find((r) => r.id === id)?.fields["Name"] ?? id;
    console.log(`  ${name}: ${JSON.stringify(val)}`);
  }
  console.log();

  // 2. Fetch ALL TripCourse records (chunked by Airtable page size)
  console.log("Fetching all TripCourse records...");
  const tcRecords = await base("TripCourses")
    .select({ maxRecords: 5000 })
    .all();

  console.log(`Found ${tcRecords.length} TripCourse record(s) total.\n`);

  // 3. Find TripCourse rows that match one of the courses and need updating
  const toUpdate = [];

  for (const tc of tcRecords) {
    const courseIds = tc.fields["Golf Course"];
    if (!Array.isArray(courseIds) || !courseIds[0]) continue;

    const courseId = courseIds[0];
    if (!stateTop100ByCourseId.has(courseId)) continue;

    const newVal = stateTop100ByCourseId.get(courseId);
    const currentVal = tc.fields["State Top 100"] ?? null;

    if (currentVal === newVal) continue; // already correct

    toUpdate.push({ id: tc.id, newVal, currentVal });
  }

  if (!toUpdate.length) {
    console.log("All TripCourse rows are already up to date. Nothing to do.");
    return;
  }

  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Updating ${toUpdate.length} TripCourse row(s):\n`);

  // 4. Apply updates in batches of 10 (Airtable limit)
  const BATCH = 10;
  let updated = 0;

  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const chunk = toUpdate.slice(i, i + BATCH);

    for (const { id, newVal, currentVal } of chunk) {
      const tcRecord = tcRecords.find((r) => r.id === id);
      const courseIds = tcRecord?.fields["Golf Course"];
      const courseId = Array.isArray(courseIds) ? courseIds[0] : null;
      const courseName =
        courseId
          ? courseRecords.find((r) => r.id === courseId)?.fields["Name"] ?? courseId
          : id;

      console.log(`  TripCourse ${id}  course=${courseName}  ${JSON.stringify(currentVal)} → ${JSON.stringify(newVal)}`);
    }

    if (!DRY_RUN) {
      await base("TripCourses").update(
        chunk.map(({ id, newVal }) => ({ id, fields: { "State Top 100": newVal } }))
      );
    }

    updated += chunk.length;
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] Would have updated" : "Updated"} ${updated} TripCourse row(s). Done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
