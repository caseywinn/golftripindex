// lib/clubTrips.ts
//
// A club trip is the lifecycle object (propose → vote → plan → play → archive).
// Its vote is a plain shared_trips row linked back by shared_trips.club_trip_id,
// so the /plan poll engine runs it unchanged — see migrations/add_club_trips.sql.

import type pg from "pg";
import { getPgPool } from "@/lib/db";
import { coerceVoteConfig } from "@/lib/planVote";
import type { PollDest } from "@/lib/planPoll";
import type { VoteStatus, VoteType } from "@/lib/planVote";

export type ClubTripStatus = "draft" | "voting" | "planning" | "live" | "completed" | "archived";

/** Statuses that mean "this trip is still ahead of us" — at most one at a time. */
const OPEN_STATUSES: ClubTripStatus[] = ["draft", "voting", "planning", "live"];

export type ClubTrip = {
  id: string;
  status: ClubTripStatus;
  title: string | null;
  chosenDestination: string | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  /** users.name of the proposer; null if that account is gone. */
  proposedBy: string | null;
  /** The shared_trips row running the vote. Null for a trip with no poll. */
  pollId: string | null;
  destinations: PollDest[];
  voteType: VoteType | null;
  voteStatus: VoteStatus | null;
  /** Turnout for the poll's current round. */
  roster: { size: number; voted: number };
};

type TripRow = {
  id: string;
  status: ClubTripStatus;
  title: string | null;
  chosen_destination: string | null;
  start_date: Date | null;
  end_date: Date | null;
  created_at: Date;
  proposed_by: string | null;
  poll_id: string | null;
  state: { destinations?: PollDest[]; vote?: unknown } | null;
  roster_size: number;
  voted: number;
};

function toClubTrip(r: TripRow): ClubTrip {
  const vote = coerceVoteConfig(r.state?.vote);
  return {
    id: String(r.id),
    status: r.status,
    title: r.title,
    chosenDestination: r.chosen_destination,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at,
    proposedBy: r.proposed_by,
    pollId: r.poll_id ? String(r.poll_id) : null,
    destinations: Array.isArray(r.state?.destinations) ? r.state!.destinations! : [],
    voteType: vote?.type ?? null,
    voteStatus: vote?.status ?? null,
    roster: { size: r.roster_size ?? 0, voted: r.voted ?? 0 },
  };
}

// Turnout is counted for the poll's CURRENT round, which the round number inside
// state.vote defines — a bracket's round 2 shouldn't show round 1's ballots as
// votes already in. COALESCE to 1 covers approval/ranked and any legacy blob.
const TRIP_SELECT = `
  SELECT t.id, t.status, t.title, t.chosen_destination, t.start_date, t.end_date,
         t.created_at, u.name AS proposed_by,
         s.id AS poll_id, s.state,
         (SELECT COUNT(*)::int FROM trip_poll_voters v WHERE v.shared_trip_id = s.id)
           AS roster_size,
         (SELECT COUNT(*)::int FROM trip_poll_ballots b
           WHERE b.shared_trip_id = s.id
             AND b.round = COALESCE((s.state -> 'vote' ->> 'currentRound')::int, 1))
           AS voted
    FROM club_trips t
    LEFT JOIN users u ON u.id = t.created_by
    LEFT JOIN shared_trips s ON s.club_trip_id = t.id
`;

/**
 * The trip the club is currently working on, or null.
 *
 * Only one open trip is expected at a time — createClubTrip enforces that — so
 * this returns the newest rather than a list.
 */
export async function getCurrentClubTrip(clubId: string, poolArg?: pg.Pool): Promise<ClubTrip | null> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `${TRIP_SELECT} WHERE t.club_id = $1 AND t.status = ANY($2) ORDER BY t.created_at DESC LIMIT 1`,
    [clubId, OPEN_STATUSES]
  );
  return rows.length ? toClubTrip(rows[0] as TripRow) : null;
}

/** Trips the club has finished, newest first — the photojournal's backing list. */
export async function listPastClubTrips(clubId: string, poolArg?: pg.Pool): Promise<ClubTrip[]> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `${TRIP_SELECT} WHERE t.club_id = $1 AND t.status IN ('completed', 'archived')
      ORDER BY COALESCE(t.start_date, t.created_at::date) DESC`,
    [clubId]
  );
  return rows.map((r) => toClubTrip(r as TripRow));
}

export type CreateTripResult =
  | { ok: true; tripId: string; pollId: string }
  | { ok: false; status: number; error: string };

/**
 * Propose a trip: create the club_trips row, its poll (a shared_trips row), and
 * seed the roster from the club's active members — all in one transaction.
 *
 * The roster seed is the reason this can't just call /api/plan/share. In /plan
 * the only way onto a roster is to be emailed a link, so the seat insert rides
 * along inside the email handler (app/api/plan/share/email/route.ts:71-82) and a
 * failed send leaves a phantom voter in the auto-close denominator. A club
 * already knows its members, so it seeds them directly and sends nothing.
 *
 * Atomic because a partial commit is a broken poll: a share row with no roster
 * auto-closes on the first ballot (denominator of zero voters vs one), and a
 * club trip with no share row renders as a trip nobody can vote on.
 */
export async function createClubTrip(
  opts: {
    clubId: string;
    createdBy: string;
    createdByName: string | null;
    title: string | null;
    destinations: PollDest[];
    vote: { type: VoteType; status: VoteStatus; currentRound: number; bracket?: unknown };
    golfers: number | null;
    nights: number | null;
    when: unknown;
  },
  poolArg?: pg.Pool
): Promise<CreateTripResult> {
  const pool = poolArg ?? getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the club so two admins proposing at once can't both pass the
    // one-open-trip check and land a pair of competing votes on the page.
    await client.query(`SELECT 1 FROM clubs WHERE id = $1 FOR UPDATE`, [opts.clubId]);

    const { rows: open } = await client.query(
      `SELECT 1 FROM club_trips WHERE club_id = $1 AND status = ANY($2) LIMIT 1`,
      [opts.clubId, OPEN_STATUSES]
    );
    if (open.length) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 409,
        error: "This club already has a trip in the works. Finish or archive it first.",
      };
    }

    // The roster is the club's active members. Suspended and invited-but-unclaimed
    // members are deliberately excluded: an unclaimed invite has no user_id, so it
    // could never cast a ballot, and seating it would inflate the auto-close
    // denominator to a number the club can never reach.
    const { rows: memberRows } = await client.query(
      `SELECT email, user_id FROM club_members
        WHERE club_id = $1 AND status = 'active'`,
      [opts.clubId]
    );
    if (memberRows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, status: 400, error: "This club has no active members to vote." };
    }

    const { rows: tripRows } = await client.query(
      `INSERT INTO club_trips (club_id, status, title, created_by)
       VALUES ($1, 'voting', $2, $3) RETURNING id`,
      [opts.clubId, opts.title, opts.createdBy]
    );
    const tripId = String(tripRows[0].id);

    const state = {
      destinations: opts.destinations,
      golfers: opts.golfers,
      nights: opts.nights,
      when: opts.when,
      sharedBy: opts.createdByName,
      vote: opts.vote,
    };
    const { rows: pollRows } = await client.query(
      `INSERT INTO shared_trips (user_id, state, club_trip_id)
       VALUES ($1, $2::jsonb, $3) RETURNING id`,
      [opts.createdBy, JSON.stringify(state), tripId]
    );
    const pollId = String(pollRows[0].id);

    // user_id is pre-bound for every seat (an active member always has one), so
    // unlike a /plan share there is no claim-on-login step for a club poll.
    // is_captain marks the proposer for display order only — closing rights come
    // from club role, not this flag (see lib/planPoll.isPollCaptain).
    await client.query(
      `INSERT INTO trip_poll_voters (shared_trip_id, email, user_id, is_captain)
       SELECT $1, lower(m.email), m.user_id::text, m.user_id = $2::uuid
         FROM club_members m
        WHERE m.club_id = $3 AND m.status = 'active'
       ON CONFLICT (shared_trip_id, email) DO NOTHING`,
      [pollId, opts.createdBy, opts.clubId]
    );

    await client.query("COMMIT");
    return { ok: true, tripId, pollId };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Record the poll's winner on the club trip and move it to PLANNING.
 *
 * Called when a poll closes. Without this the winner would exist only as a
 * re-tally of the ballots, and nothing outside the poll page could answer "where
 * are we going" — the club page included.
 */
export async function lockClubTripWinner(
  pool: pg.Pool,
  clubTripId: string,
  destinationSlug: string
): Promise<void> {
  await pool.query(
    `UPDATE club_trips
        SET chosen_destination = $2, status = 'planning'
      WHERE id = $1 AND status = 'voting'`,
    [clubTripId, destinationSlug]
  );
}

export type TripAction = "complete" | "archive";

/**
 * Move a trip out of the open set: played it (`complete`) or shelved it
 * (`archive`).
 *
 * Without this a club is a one-shot. Winning a vote parks a trip in PLANNING,
 * PLANNING is an open status, and only one open trip is allowed at a time — so
 * with no way out, the club's first trip blocks every future proposal forever
 * and "Previous trips" can never populate.
 *
 * `archive` is also the escape hatch for a trip with nowhere to go: a poll that
 * closes in an exact tie locks no winner and stays in VOTING (see
 * planPoll.recordClubWinner), and a mistaken proposal otherwise blocks the club.
 * It's deliberately allowed from ANY open status for that reason.
 */
export async function setClubTripStatus(
  clubId: string,
  tripId: string,
  action: TripAction,
  poolArg?: pg.Pool
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const pool = poolArg ?? getPgPool();

  // Scoped by club_id as well as id: the trip id comes from the client, and
  // without this an admin of club A could archive club B's trip.
  const target: ClubTripStatus = action === "complete" ? "completed" : "archived";
  const allowedFrom: ClubTripStatus[] =
    action === "complete" ? ["planning", "live"] : OPEN_STATUSES;

  const { rowCount } = await pool.query(
    `UPDATE club_trips SET status = $3
      WHERE id = $1 AND club_id = $2 AND status = ANY($4)`,
    [tripId, clubId, target, allowedFrom]
  );

  if (!rowCount) {
    return {
      ok: false,
      status: 409,
      error:
        action === "complete"
          ? "Only a trip that's been planned can be marked played."
          : "That trip isn't open.",
    };
  }
  return { ok: true };
}
