/**
 * Test whether a given Airtable token can actually record an email signup.
 *
 * /api/subscribe reads the base fine but can't write in production, and the
 * route only ever said "Server error". This asks Airtable directly and prints
 * the real status code, so you can tell a read-only token (401/403) from a wrong
 * table name (404) from a field mismatch (422) without deploying anything.
 *
 * Defaults to the values in .env.local. To test what production has, pass them
 * in — nothing is written to disk:
 *
 *   npx tsx scripts/check-subscribe.mts
 *   AIRTABLE_API_KEY=pat... npx tsx scripts/check-subscribe.mts
 *
 * A successful write is deleted again immediately, so this never leaves a junk
 * subscriber behind.
 */
import fs from "node:fs";

function fromEnvFile(key: string): string | undefined {
  try {
    return fs
      .readFileSync(".env.local", "utf8")
      .match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]
      .trim()
      .replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const KEY = process.env.AIRTABLE_API_KEY || fromEnvFile("AIRTABLE_API_KEY");
const BASE = process.env.AIRTABLE_BASE_ID || fromEnvFile("AIRTABLE_BASE_ID");
const TABLE =
  process.env.AIRTABLE_SUBSCRIBERS_TABLE || fromEnvFile("AIRTABLE_SUBSCRIBERS_TABLE") || "Subscribers";

if (!KEY || !BASE) {
  console.error("AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set (env or .env.local).");
  process.exit(1);
}

console.log(`base=${BASE}  table="${TABLE}"  token=${KEY.slice(0, 8)}…\n`);
const api = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;
const auth = { Authorization: `Bearer ${KEY}` };

/**
 * Airtable answers 403 both for "your token can't do that" and for "that table
 * isn't here" — addressing a table by name gives no 404 to distinguish them. The
 * schema endpoint settles it when the token can reach it.
 */
let tableExists: boolean | null = null;
const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`, { headers: auth });
if (metaRes.ok) {
  const names = ((await metaRes.json()) as { tables: { name: string }[] }).tables.map((t) => t.name);
  tableExists = names.includes(TABLE);
  console.log(`SCHEMA OK — ${names.length} tables; "${TABLE}" ${tableExists ? "exists" : "IS MISSING"}`);
} else {
  console.log(`SCHEMA unavailable (${metaRes.status}) — can't confirm the table exists with this token`);
}

function explain(status: number, body: string): string {
  if (status === 401) return "token is invalid or expired";
  if (status === 403) {
    if (tableExists === false) return `no table named "${TABLE}" in this base — check AIRTABLE_SUBSCRIBERS_TABLE`;
    if (tableExists === true) return "table exists, so the token lacks data.records:write on this base";
    return `either the token lacks data.records:write, or "${TABLE}" isn't a table in this base`;
  }
  if (status === 404) return `base ${BASE} not found for this token — check AIRTABLE_BASE_ID`;
  if (status === 422) return "field names don't match the table's columns (expects Email, Signed Up At)";
  return body.slice(0, 200);
}

// 1. Read. Separates "token can't see this base at all" from "token can't write".
const readRes = await fetch(`${api}?maxRecords=1`, { headers: auth });
const readBody = await readRes.text();
console.log(
  readRes.ok
    ? "READ   OK — token can list the table"
    : `READ   FAILED ${readRes.status} — ${explain(readRes.status, readBody)}`
);

// 2. Write exactly what the route writes.
const email = `check-subscribe-probe@golftripindex.test`;
const writeRes = await fetch(api, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({
    records: [{ fields: { Email: email, "Signed Up At": new Date().toISOString().slice(0, 10) } }],
  }),
});
const writeBody = await writeRes.text();

if (!writeRes.ok) {
  console.log(`WRITE  FAILED ${writeRes.status} — ${explain(writeRes.status, writeBody)}`);
  console.log("\nThis is what /api/subscribe hits. Fix it in the environment this token came from.");
  process.exit(1);
}

const created = JSON.parse(writeBody).records?.[0]?.id as string | undefined;
console.log("WRITE  OK — signup would be recorded");

// 3. Clean up the probe row.
if (created) {
  const del = await fetch(`${api}/${created}`, { method: "DELETE", headers: auth });
  console.log(del.ok ? "CLEAN  OK — probe record removed" : `CLEAN  FAILED — delete ${created} by hand`);
}
console.log("\nThis token/base/table combination works.");
