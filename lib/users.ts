import type pg from "pg";
import { getPgPool } from "@/lib/db";

/**
 * Resolve-or-create the local users row for an OAuth sign-in, returning users.id.
 *
 * OAuth providers give us no password, so the created row has a NULL
 * password_hash — see migrations/add_oauth_users.sql. A NULL there means
 * "OAuth-only account"; auth.ts refuses the credentials path for those.
 *
 * Also the account-linking point: someone who registered with a password and
 * later signs in with Google on the same address resolves to the SAME row rather
 * than a second identity. Seat billing depends on one human = one users.id.
 *
 * Callers must pass an already-lowercased email. The unique index backing
 * ON CONFLICT is on raw `email`, so consistent lowercasing at every write is
 * what actually keeps Casey@x.com and casey@x.com from becoming two accounts.
 */
export async function upsertUserByEmail(email: string, name?: string | null): Promise<string> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `INSERT INTO users (name, email)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE
       SET name = COALESCE(NULLIF(users.name, ''), EXCLUDED.name)
     RETURNING id`,
    [name?.trim() || email.split("@")[0], email]
  );
  return String(rows[0].id);
}

/** users.id for an already-lowercased email, or null if there's no such row. */
export async function localUserIdByEmail(email: string): Promise<string | null> {
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  return rows.length ? String(rows[0].id) : null;
}

// ── Password ─────────────────────────────────────────────────────────────────

/**
 * Whether this account has a password at all.
 *
 * A NULL password_hash means OAuth-only (see upsertUserByEmail above), and the
 * bag page keys the change-password card off this: there is no current password
 * to verify for a Google-only golfer, so the card would be unanswerable. Those
 * accounts get a password through the emailed reset link instead, which proves
 * control of the address — see lib/passwordReset.ts.
 */
export async function userHasPassword(userId: string, poolArg?: pg.Pool): Promise<boolean> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT password_hash IS NOT NULL AS has FROM users WHERE id = $1`,
    [userId]
  );
  return rows.length ? Boolean(rows[0].has) : false;
}

/** The stored bcrypt hash, or null for an OAuth-only account. */
export async function getPasswordHash(userId: string, poolArg?: pg.Pool): Promise<string | null> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  return rows.length ? (rows[0].password_hash ?? null) : null;
}

/** Write an already-hashed password. Callers hash; this only stores. */
export async function setPasswordHash(
  userId: string,
  hash: string,
  poolArg?: pg.Pool
): Promise<void> {
  const pool = poolArg ?? getPgPool();
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, hash]);
}

// ── Profile (edited from the My Bag page) ────────────────────────────────────

export type UserProfile = {
  /** The Handle — users.name. Shown across the site; spaces allowed. */
  name: string;
  /** The login; never editable here. */
  email: string;
  /** Free-form handicap index, e.g. "12.4" or "+1.3". */
  handicap: string | null;
  /** A published trip's slug, resolved against Airtable at render time. */
  favoriteTrip: string | null;
};

/**
 * The profile fields for the bag page. Read fresh from the DB rather than from
 * the session: the JWT freezes name at login (see auth.ts), so a just-edited
 * Handle would otherwise not show until the next sign-in.
 */
export async function getUserProfile(userId: string, poolArg?: pg.Pool): Promise<UserProfile | null> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT name, email, handicap, favorite_trip FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    name: r.name ?? "",
    email: r.email,
    handicap: r.handicap ?? null,
    favoriteTrip: r.favorite_trip ?? null,
  };
}

export async function updateUserProfile(
  userId: string,
  fields: { name: string; handicap: string | null; favoriteTrip: string | null },
  poolArg?: pg.Pool
): Promise<void> {
  const pool = poolArg ?? getPgPool();
  await pool.query(
    `UPDATE users SET name = $2, handicap = $3, favorite_trip = $4 WHERE id = $1`,
    [userId, fields.name, fields.handicap, fields.favoriteTrip]
  );
}
