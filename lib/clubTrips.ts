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
import { formatTripWhen, type WhenLike } from "@/lib/planWhen";

export type ClubTripStatus = "draft" | "voting" | "planning" | "live" | "completed" | "archived";

/** One course a club played. `slug` links to the catalog when picked from it. */
export type TripCourse = { slug: string | null; name: string };

/** One attendee. `userId` is set for a club member, null for a typed-in guest. */
export type TripAttendee = { userId: string | null; name: string };

/** Who may see a trip: every club member, or only the people who came. */
export type TripVisibility = "club" | "attendees";

/** Statuses that mean "this trip is still ahead of us" — at most one at a time. */
const OPEN_STATUSES: ClubTripStatus[] = ["draft", "voting", "planning", "live"];

export type ClubTrip = {
  id: string;
  status: ClubTripStatus;
  title: string | null;
  chosenDestination: string | null;
  /** Optional GolfTrips slug linking this trip to a catalog destination, so its
   *  courses can feed the recap picker. Separate from chosenDestination's text. */
  destinationSlug: string | null;
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
  /** The proposer's chosen window ("Fall", "March 2026"), or "" if none set. */
  whenLabel: string;
  /** Courses the club played, for the recap page. Empty until filled in. */
  courses: TripCourse[];
  /** Who came, for the recap page. Empty until filled in. */
  attendees: TripAttendee[];
  /** Who may see the trip. 'club' by default. */
  visibility: TripVisibility;
  /** Turnout for the poll's current round. */
  roster: { size: number; voted: number };
};

type TripRow = {
  id: string;
  status: ClubTripStatus;
  title: string | null;
  chosen_destination: string | null;
  destination_slug: string | null;
  start_date: Date | null;
  end_date: Date | null;
  created_at: Date;
  proposed_by: string | null;
  poll_id: string | null;
  state: { destinations?: PollDest[]; vote?: unknown; when?: WhenLike } | null;
  courses: TripCourse[] | null;
  attendees: TripAttendee[] | null;
  visibility: TripVisibility | null;
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
    destinationSlug: r.destination_slug ?? null,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at,
    proposedBy: r.proposed_by,
    pollId: r.poll_id ? String(r.poll_id) : null,
    destinations: Array.isArray(r.state?.destinations) ? r.state!.destinations! : [],
    voteType: vote?.type ?? null,
    voteStatus: vote?.status ?? null,
    whenLabel: formatTripWhen(r.state?.when),
    courses: Array.isArray(r.courses) ? r.courses : [],
    attendees: Array.isArray(r.attendees) ? r.attendees : [],
    visibility: r.visibility === "attendees" ? "attendees" : "club",
    roster: { size: r.roster_size ?? 0, voted: r.voted ?? 0 },
  };
}

// Turnout is counted for the poll's CURRENT round, which the round number inside
// state.vote defines — a bracket's round 2 shouldn't show round 1's ballots as
// votes already in. COALESCE to 1 covers approval/ranked and any legacy blob.
const TRIP_SELECT = `
  SELECT t.id, t.status, t.title, t.chosen_destination, t.destination_slug,
         t.start_date, t.end_date,
         t.created_at, t.courses, t.attendees, t.visibility, u.name AS proposed_by,
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

/** A single club trip by id, scoped to its club (for the trip detail page). */
export async function getClubTripById(
  clubId: string,
  tripId: string,
  poolArg?: pg.Pool
): Promise<ClubTrip | null> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `${TRIP_SELECT} WHERE t.id = $1 AND t.club_id = $2 LIMIT 1`,
    [tripId, clubId]
  );
  return rows.length ? toClubTrip(rows[0] as TripRow) : null;
}

/**
 * Update a trip's recap fields — any subset of courses / attendees / visibility.
 * Scoped by club_id so a manager of one club can't edit another's trip. Only the
 * provided fields are written.
 */
export async function updateClubTripRecap(
  clubId: string,
  tripId: string,
  patch: {
    courses?: TripCourse[];
    attendees?: TripAttendee[];
    visibility?: TripVisibility;
    destinationSlug?: string | null;
  },
  poolArg?: pg.Pool
): Promise<{ ok: boolean }> {
  const sets: string[] = [];
  const vals: unknown[] = [tripId, clubId];
  if (patch.courses !== undefined) {
    sets.push(`courses = $${vals.length + 1}::jsonb`);
    vals.push(JSON.stringify(patch.courses));
  }
  if (patch.attendees !== undefined) {
    sets.push(`attendees = $${vals.length + 1}::jsonb`);
    vals.push(JSON.stringify(patch.attendees));
  }
  if (patch.visibility !== undefined) {
    sets.push(`visibility = $${vals.length + 1}`);
    vals.push(patch.visibility);
  }
  if (patch.destinationSlug !== undefined) {
    sets.push(`destination_slug = $${vals.length + 1}`);
    vals.push(patch.destinationSlug);
  }
  if (sets.length === 0) return { ok: false };

  const pool = poolArg ?? getPgPool();
  const { rowCount } = await pool.query(
    `UPDATE club_trips SET ${sets.join(", ")} WHERE id = $1 AND club_id = $2`,
    vals
  );
  return { ok: (rowCount ?? 0) > 0 };
}

// ── Trip photos ──────────────────────────────────────────────────────────────

export type TripPhoto = {
  id: string;
  url: string;
  path: string;
  uploadedBy: string | null;
  createdAt: Date;
};

/** Photos for a trip, oldest first (upload order). */
export async function listTripPhotos(clubTripId: string, poolArg?: pg.Pool): Promise<TripPhoto[]> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT id, url, path, uploaded_by, created_at
       FROM club_trip_photos WHERE club_trip_id = $1 ORDER BY created_at ASC`,
    [clubTripId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    url: r.url,
    path: r.path,
    uploadedBy: r.uploaded_by ? String(r.uploaded_by) : null,
    createdAt: r.created_at,
  }));
}

/**
 * The first photo of each trip, for the club page's past-trip card thumbnails.
 *
 * One query for the whole list rather than listTripPhotos per card: the club page
 * renders every past trip at once, so per-trip calls would be a round trip each.
 * DISTINCT ON takes the oldest photo per trip, matching listTripPhotos' order, so
 * the thumbnail is the same photo that leads the gallery.
 *
 * Trips with no photos are simply absent from the map; the caller falls back.
 */
export async function firstPhotoByTrip(
  clubTripIds: string[],
  poolArg?: pg.Pool
): Promise<Map<string, string>> {
  if (clubTripIds.length === 0) return new Map();
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (club_trip_id) club_trip_id, url
       FROM club_trip_photos
      WHERE club_trip_id = ANY($1::uuid[])
      ORDER BY club_trip_id, created_at ASC`,
    [clubTripIds]
  );
  return new Map(rows.map((r) => [String(r.club_trip_id), r.url as string]));
}

export async function addTripPhoto(
  clubTripId: string,
  path: string,
  url: string,
  uploadedBy: string,
  poolArg?: pg.Pool
): Promise<TripPhoto> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `INSERT INTO club_trip_photos (club_trip_id, path, url, uploaded_by)
     VALUES ($1, $2, $3, $4) RETURNING id, url, path, uploaded_by, created_at`,
    [clubTripId, path, url, uploadedBy]
  );
  const r = rows[0];
  return {
    id: String(r.id),
    url: r.url,
    path: r.path,
    uploadedBy: r.uploaded_by ? String(r.uploaded_by) : null,
    createdAt: r.created_at,
  };
}

/**
 * Delete a photo row, scoped to its club and trip so a manager of one club can't
 * remove another's. Returns the storage path so the caller can delete the object,
 * or null if nothing matched.
 */
export async function deleteTripPhoto(
  clubId: string,
  tripId: string,
  photoId: string,
  poolArg?: pg.Pool
): Promise<{ path: string } | null> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `DELETE FROM club_trip_photos p
       USING club_trips t
      WHERE p.id = $1 AND p.club_trip_id = t.id AND t.id = $2 AND t.club_id = $3
      RETURNING p.path`,
    [photoId, tripId, clubId]
  );
  return rows.length ? { path: rows[0].path } : null;
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

/**
 * Manually record a trip the club already took, for its history — the case where
 * a trip never went through a vote (it happened before the club used the app, or
 * off-platform). It lands straight in COMPLETED with no poll, so it never counts
 * as the club's one open trip and shows only under "Previous trips".
 *
 * chosen_destination holds the free-text place (there's no poll to resolve a slug
 * against); the card renders it as a detail line rather than a vote result.
 */
export async function createManualClubTrip(
  opts: {
    clubId: string;
    createdBy: string;
    title: string;
    destination: string | null;
    /** GolfTrips slug if the destination was picked from the catalog, else null. */
    destinationSlug: string | null;
    startDate: string | null; // "YYYY-MM-DD"
    endDate: string | null;
  },
  poolArg?: pg.Pool
): Promise<{ ok: true; tripId: string } | { ok: false; status: number; error: string }> {
  const title = opts.title.trim();
  if (!title) return { ok: false, status: 400, error: "Give the trip a name." };
  // Honour the club_trips CHECK (end_date >= start_date) with a friendly message
  // rather than letting the DB raise.
  if (opts.startDate && opts.endDate && opts.endDate < opts.startDate) {
    return { ok: false, status: 400, error: "The end date can't be before the start date." };
  }

  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `INSERT INTO club_trips
       (club_id, status, title, chosen_destination, destination_slug, start_date, end_date, created_by)
     VALUES ($1, 'completed', $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      opts.clubId,
      title.slice(0, 120),
      opts.destination?.trim().slice(0, 120) || null,
      opts.destinationSlug || null,
      opts.startDate || null,
      opts.endDate || null,
      opts.createdBy,
    ]
  );
  return { ok: true, tripId: String(rows[0].id) };
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
