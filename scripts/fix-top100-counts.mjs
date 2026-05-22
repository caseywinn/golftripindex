/**
 * Fixes "Number of Top 100 Courses" for the 12 mismatched new trips.
 */

import Airtable from "airtable";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

Airtable.configure({ apiKey: process.env.AIRTABLE_API_KEY });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

const FIXES = {
  "cabo-san-lucas-los-cabos": 0,
  "eastern-shore-maryland":   0,
  "finger-lakes":             0,
  "hawaii-big-island":        1,
  "houston-area":             0,
  "maine":                    0,
  "nemacolin-woodlands":      0,
  "prince-edward-island":     0,
  "san-antonio":              0,
  "jekyll-island":            1,
  "kingsmill-resort":         1,
  "miami-west-palm-beach":    2,
};

async function main() {
  const slugs = Object.keys(FIXES);
  const formula = `OR(${slugs.map(s => `{Slug}="${s}"`).join(",")})`;

  const records = await base("GolfTrips")
    .select({ filterByFormula: formula, fields: ["Name", "Slug", "Number of Top 100 Courses"], maxRecords: 50 })
    .all();

  console.log(`Found ${records.length} trips to update.\n`);

  for (const r of records) {
    const slug = r.fields["Slug"];
    const name = r.fields["Name"];
    const oldVal = r.fields["Number of Top 100 Courses"] ?? null;
    const newVal = FIXES[slug];

    await base("GolfTrips").update(r.id, { "Number of Top 100 Courses": newVal });
    console.log(`  Updated: ${name}  (${oldVal} → ${newVal})`);
  }

  console.log("\nDone.");
}

main().catch(err => { console.error(err); process.exit(1); });
