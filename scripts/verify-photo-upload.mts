/**
 * End-to-end check of the trip photo upload flow against a running dev server.
 *
 * Drives the real routes in order — sign URL, PUT to Supabase, record, delete —
 * rather than writing rows itself, so a missing or broken step actually fails
 * here instead of being papered over by test-authored state.
 *
 *   npm run dev          # in another shell, on PORT below
 *   npx tsx scripts/verify-photo-upload.mts
 */
import { encode } from "@auth/core/jwt";
import pg from "pg";
import fs from "node:fs";

const PORT = process.env.PORT ?? "3010";
const BASE = `http://127.0.0.1:${PORT}`;
const COOKIE_NAME = "authjs.session-token";

function env(key: string): string {
  const raw = fs.readFileSync(".env.local", "utf8");
  const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) throw new Error(`${key} missing from .env.local`);
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/** A 1x1 JPEG, enough for Supabase to accept as image/jpeg. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

const pool = new pg.Pool({
  connectionString: env("DATABASE_URL"),
  ssl: { rejectUnauthorized: false },
});

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

// A trip whose club the signed-in user can manage.
const { rows: tripRows } = await pool.query(
  `SELECT t.id AS trip_id, c.slug, m.user_id
     FROM club_trips t
     JOIN clubs c ON c.id = t.club_id
     JOIN club_members m ON m.club_id = c.id
    WHERE m.role IN ('owner','admin') AND m.status = 'active'
    ORDER BY t.created_at DESC
    LIMIT 1`
);
if (!tripRows.length) {
  console.error("No trip with an owner/admin member to test against.");
  process.exit(1);
}
const { trip_id: tripId, slug, user_id: userId } = tripRows[0];
console.log(`club=${slug} trip=${tripId} as user=${String(userId).slice(0, 8)}\n`);

const cookie = `${COOKIE_NAME}=${await encode({
  salt: COOKIE_NAME,
  secret: env("AUTH_SECRET"),
  token: { sub: String(userId) },
})}`;

const api = `${BASE}/api/clubs/${encodeURIComponent(slug)}/trips/${tripId}/photos`;
const headers = { cookie, "Content-Type": "application/json" };

// 1. Signed URLs for a two-file batch — the case that used to 413 on Vercel.
const signRes = await fetch(`${api}/upload-url`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    files: [
      { name: "a.jpg", type: "image/jpeg", size: JPEG.length },
      { name: "b.jpg", type: "image/jpeg", size: JPEG.length },
    ],
  }),
});
const signed = await signRes.json();
check("mints signed upload urls", signRes.ok && signed.uploads?.length === 2, `HTTP ${signRes.status}`);
if (!signRes.ok) {
  console.error(signed);
  process.exit(1);
}
check(
  "paths are scoped to this trip",
  signed.uploads.every((u: { path: string }) => u.path.startsWith(`${tripId}/`))
);

// 2. Browser-side upload: no credentials beyond the signed URL itself.
const puts = await Promise.all(
  signed.uploads.map((u: { signedUrl: string }) =>
    fetch(u.signedUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: JPEG })
  )
);
check("uploads direct to storage", puts.every((r) => r.ok), puts.map((r) => r.status).join(","));

// 3. Record the finished objects.
const paths: string[] = signed.uploads.map((u: { path: string }) => u.path);
const recRes = await fetch(api, { method: "POST", headers, body: JSON.stringify({ paths }) });
const recorded = await recRes.json();
check("records both photos", recRes.status === 201 && recorded.photos?.length === 2, `HTTP ${recRes.status}`);

const { rows: after } = await pool.query(
  `SELECT id, url FROM club_trip_photos WHERE path = ANY($1)`,
  [paths]
);
check("rows exist in club_trip_photos", after.length === 2);
check("url is publicly reachable", (await fetch(after[0]?.url ?? "")).ok);

// 4. A path we never minted must be refused even with a valid session.
const forged = await fetch(api, {
  method: "POST",
  headers,
  body: JSON.stringify({ paths: [`00000000-0000-4000-8000-000000000000/${crypto.randomUUID()}.jpg`] }),
});
check("rejects a path from another trip", forged.status === 404, `HTTP ${forged.status}`);

// A well-formed path for THIS trip that was never uploaded: caught by objectExists.
const ghost = await fetch(api, {
  method: "POST",
  headers,
  body: JSON.stringify({ paths: [`${tripId}/${crypto.randomUUID()}.jpg`] }),
});
check("rejects a path with no object behind it", ghost.status === 409, `HTTP ${ghost.status}`);

// 5. Unauthenticated callers get nothing.
const anon = await fetch(`${api}/upload-url`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ files: [{ name: "a.jpg", type: "image/jpeg", size: 10 }] }),
});
check("upload-url requires a session", anon.status === 401, `HTTP ${anon.status}`);

// 6. Clean up through the delete route, which is also the teardown check.
for (const row of after) {
  const del = await fetch(`${api}/${row.id}`, { method: "DELETE", headers: { cookie } });
  check(`deletes photo ${String(row.id).slice(0, 8)}`, del.ok, `HTTP ${del.status}`);
}
const { rows: left } = await pool.query(`SELECT id FROM club_trip_photos WHERE path = ANY($1)`, [paths]);
check("rows cleaned up", left.length === 0);

await pool.end();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
