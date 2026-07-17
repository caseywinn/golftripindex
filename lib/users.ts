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
