// Verify add_club_trips.sql inside a transaction that is ALWAYS rolled back.
// Nothing here persists to the database.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "node:fs";
import pg from "pg";

const sql = fs.readFileSync("migrations/add_club_trips.sql", "utf8");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const log = (ok, msg) => console.log(`${ok ? "  ok  " : " FAIL "} ${msg}`);
let failures = 0;
const check = (ok, msg) => { if (!ok) failures++; log(ok, msg); };

// Expect a query to fail (constraint enforcement). Uses a savepoint so the
// error doesn't poison the outer transaction.
async function expectReject(label, fn) {
  await client.query("SAVEPOINT sp");
  try {
    await fn();
    await client.query("ROLLBACK TO SAVEPOINT sp");
    check(false, `${label} — expected rejection, but it was ACCEPTED`);
  } catch (e) {
    await client.query("ROLLBACK TO SAVEPOINT sp");
    check(true, `${label} — rejected (${e.message.split("\n")[0].slice(0, 70)})`);
  }
}

await client.connect();
await client.query("BEGIN");
try {
  console.log("\n── migration applies ─────────────────────────────");
  await client.query(sql);
  check(true, "add_club_trips.sql runs clean");

  // Re-running must be a no-op (IF NOT EXISTS everywhere).
  await client.query(sql);
  check(true, "re-running is idempotent");

  // Seed a club + owner to hang trips off.
  const { rows: u } = await client.query(
    `INSERT INTO users (name, email) VALUES ('Verify Owner', 'verify-owner@example.test') RETURNING id`
  );
  const ownerId = u[0].id;
  const { rows: c } = await client.query(
    `INSERT INTO clubs (name, slug, owner_id, tier, seat_limit)
     VALUES ('Verify CC', 'verify-cc-tmp', $1, 'small', 12) RETURNING id`,
    [ownerId]
  );
  const clubId = c[0].id;

  console.log("\n── club_trips constraints ────────────────────────");
  const { rows: t } = await client.query(
    `INSERT INTO club_trips (club_id, status, created_by) VALUES ($1, 'voting', $2) RETURNING id`,
    [clubId, ownerId]
  );
  const tripId = t[0].id;
  check(!!tripId, "a voting trip inserts");

  await expectReject("bogus status", () =>
    client.query(`INSERT INTO club_trips (club_id, status, created_by) VALUES ($1, 'nonsense', $2)`, [clubId, ownerId])
  );

  await expectReject("end_date before start_date", () =>
    client.query(
      `INSERT INTO club_trips (club_id, created_by, start_date, end_date)
       VALUES ($1, $2, '2026-09-10', '2026-09-01')`,
      [clubId, ownerId]
    )
  );

  await expectReject("deleting a user who proposed a trip (RESTRICT)", () =>
    client.query(`DELETE FROM users WHERE id = $1`, [ownerId])
  );

  console.log("\n── shared_trips.club_trip_id link ────────────────");
  const { rows: s } = await client.query(
    `INSERT INTO shared_trips (user_id, state, club_trip_id)
     VALUES ($1, '{"destinations":[]}'::jsonb, $2) RETURNING id`,
    [ownerId, tripId]
  );
  check(!!s[0].id, "a poll links to a club trip");

  await expectReject("a SECOND poll on the same club trip (unique index)", () =>
    client.query(
      `INSERT INTO shared_trips (user_id, state, club_trip_id) VALUES ($1, '{}'::jsonb, $2)`,
      [ownerId, tripId]
    )
  );

  // The partial index must not make plain /plan shares collide with each other.
  await client.query(`INSERT INTO shared_trips (user_id, state) VALUES ($1, '{}'::jsonb)`, [ownerId]);
  await client.query(`INSERT INTO shared_trips (user_id, state) VALUES ($1, '{}'::jsonb)`, [ownerId]);
  check(true, "two /plan shares (club_trip_id NULL) coexist — partial index scoped right");

  console.log("\n── cascade ───────────────────────────────────────");
  await client.query(`INSERT INTO trip_poll_voters (shared_trip_id, email, user_id) VALUES ($1, 'v@example.test', $2)`, [s[0].id, ownerId]);
  await client.query(`DELETE FROM club_trips WHERE id = $1`, [tripId]);
  const { rows: leftPolls } = await client.query(`SELECT 1 FROM shared_trips WHERE id = $1`, [s[0].id]);
  check(leftPolls.length === 0, "deleting a club trip cascades away its poll");
  const { rows: leftVoters } = await client.query(`SELECT 1 FROM trip_poll_voters WHERE shared_trip_id = $1`, [s[0].id]);
  check(leftVoters.length === 0, "…and the poll's roster with it");

  console.log("\n── existing /plan rows are untouched ─────────────");
  const { rows: existing } = await client.query(
    `SELECT COUNT(*)::int AS n, COUNT(club_trip_id)::int AS clubbed FROM shared_trips WHERE user_id <> $1`,
    [ownerId]
  );
  check(existing[0].clubbed === 0, `all ${existing[0].n} pre-existing shares have club_trip_id NULL (no backfill needed)`);
} catch (err) {
  failures++;
  console.error("\n UNEXPECTED ERROR:", err.message);
} finally {
  await client.query("ROLLBACK");
  await client.end();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} — transaction rolled back, nothing persisted.\n`);
  process.exit(failures === 0 ? 0 : 1);
}
