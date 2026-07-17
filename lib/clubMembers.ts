import type pg from "pg";
import { getPgPool } from "@/lib/db";

/**
 * Bind every pending club invite for this email to the now-logged-in user.
 *
 * Generalizes claimRosterSeat in lib/planPoll.ts, with one deliberate change:
 * that one is SCOPED to a single shared_trip_id, so it can only claim the poll
 * you happen to be looking at, and it runs lazily as a side effect of rendering
 * that poll. A club member has to be on the roster the moment they log in — the
 * club page can't render their standing otherwise — so this is unscoped and runs
 * from the signIn callback in auth.ts.
 *
 * Two clauses carry the weight:
 *   user_id IS NULL   — security-critical, carried over from claimRosterSeat.
 *                       Without it a second user with the same email could take
 *                       over a seat that's already bound.
 *   status='invited'  — new here. Stops a removed or suspended member from
 *                       silently reactivating themselves by logging in.
 *
 * Idempotent, so it's safe on every sign-in. Returns how many seats were claimed.
 */
export async function claimClubInvites(
  userId: string,
  email: string,
  poolArg?: pg.Pool
): Promise<number> {
  if (!userId || !email) return 0;
  const pool = poolArg ?? getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE club_members
        SET user_id = $1, status = 'active', joined_at = now()
      WHERE lower(email) = lower($2)
        AND user_id IS NULL
        AND status = 'invited'`,
    [userId, email]
  );
  return rowCount ?? 0;
}
