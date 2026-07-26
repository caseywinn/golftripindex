/**
 * Delete storage objects in the trip-photos bucket that no club_trip_photos row
 * points at.
 *
 * These accumulate because deleteObject() in lib/storage.ts is best-effort: the
 * row is the source of truth, so a failed object delete leaves the file behind
 * rather than blocking the delete.
 *
 * Dry run by default. Pass --delete to actually remove.
 *
 *   npx tsx scripts/prune-orphan-photos.mts
 *   npx tsx scripts/prune-orphan-photos.mts --delete
 *
 * SAFETY: skips anything uploaded in the last hour. Photos now go to storage
 * before their row is written, so an upload in progress looks exactly like an
 * orphan — without this guard a prune run during an active upload would delete
 * the very photos someone is adding.
 */
import pg from "pg";
import fs from "node:fs";

const DELETE = process.argv.includes("--delete");
const MIN_AGE_MS = 60 * 60 * 1000;
const BUCKET = "trip-photos";

function env(key: string): string | undefined {
  const raw = fs.readFileSync(".env.local", "utf8");
  return raw.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "");
}

const SUPABASE_URL = env("SUPABASE_URL")!;
const KEY = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY")!;
const HEADERS = { Authorization: `Bearer ${KEY}`, apikey: KEY, "Content-Type": "application/json" };

type Entry = { name: string; id: string | null; created_at: string; metadata?: { size?: number } };

/** One page-through of a prefix. Entries with id === null are folders. */
async function list(prefix: string): Promise<Entry[]> {
  const out: Entry[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`list ${prefix}: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as Entry[];
    out.push(...page);
    if (page.length < limit) break;
  }
  return out;
}

const top = await list("");
const objects: { path: string; size: number; created: string }[] = [];
for (const entry of top) {
  if (entry.id !== null) {
    objects.push({ path: entry.name, size: entry.metadata?.size ?? 0, created: entry.created_at });
    continue;
  }
  for (const child of await list(`${entry.name}/`)) {
    if (child.id !== null) {
      objects.push({
        path: `${entry.name}/${child.name}`,
        size: child.metadata?.size ?? 0,
        created: child.created_at,
      });
    }
  }
}

const pool = new pg.Pool({
  connectionString: env("DATABASE_URL"),
  ssl: { rejectUnauthorized: false },
});
const { rows } = await pool.query("SELECT path FROM club_trip_photos");
await pool.end();
const known = new Set<string>(rows.map((r: { path: string }) => r.path));

const now = Date.now();
const unreferenced = objects.filter((o) => !known.has(o.path));
const inFlight = unreferenced.filter((o) => now - Date.parse(o.created) < MIN_AGE_MS);
const stale = unreferenced.filter((o) => now - Date.parse(o.created) >= MIN_AGE_MS);

console.log(`${objects.length} objects in bucket, ${known.size} referenced by a row`);
console.log(`${unreferenced.length} unreferenced (${inFlight.length} too recent to touch)\n`);

// A row whose object is missing renders as a broken image; worth knowing about,
// but this script won't delete rows.
const missing = [...known].filter((p) => !objects.some((o) => o.path === p));
if (missing.length) console.log(`WARNING: ${missing.length} row(s) point at a missing object:\n  ${missing.join("\n  ")}\n`);

if (stale.length === 0) {
  console.log("Nothing to prune.");
  process.exit(0);
}

let bytes = 0;
for (const o of stale) {
  bytes += o.size;
  console.log(`  ${(o.size / 1048576).toFixed(2).padStart(6)} MB  ${o.created}  ${o.path}`);
}
console.log(`\n${stale.length} object(s), ${(bytes / 1048576).toFixed(2)} MB`);

if (!DELETE) {
  console.log("\nDry run. Re-run with --delete to remove them.");
  process.exit(0);
}

let removed = 0;
for (const o of stale) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(o.path)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY },
  });
  if (res.ok) removed++;
  else console.error(`  failed: ${o.path} — ${res.status} ${await res.text()}`);
}
console.log(`\nDeleted ${removed}/${stale.length} object(s), freed ${(bytes / 1048576).toFixed(2)} MB.`);
