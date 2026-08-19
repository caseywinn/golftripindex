// lib/planPoll.ts
//
// Server-side helpers for reading and mutating a group vote (a shared_trips row
// whose state.vote is set). Used by the poll API routes and the shared page.

import type pg from "pg";
import { getPgPool } from "./db";
import { getClubViewer, canView, canManage } from "./clubs";
import { lockClubTripWinner } from "./clubTrips";
import { coerceVoteConfig, type VoteConfig } from "./planVote";
import { normalizeBallot, tally, type Ballot, type TallyResult } from "./planVoteEngine";
import {
  resolveRound,
  champion,
  validatePicks,
  roundMatchups,
  roundVoteCounts,
  type Bracket,
  type BracketBallot,
} from "./planBracket";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PollDest = { slug: string; name: string; overallRating: number | null; costTier: number | null };

export type SharedState = {
  destinations?: PollDest[];
  golfers?: number | null;
  nights?: number | null;
  when?: unknown;
  sharedBy?: string | null;
  vote?: unknown;
};

export type Viewer = { userId: string | null; email: string | null };

export type PollVoter = { label: string; voted: boolean; isCaptain: boolean; isYou: boolean };

export type PollView = {
  id: string;
  destinations: PollDest[];
  golfers: number | null;
  nights: number | null;
  when: unknown;
  sharedBy: string | null;
  vote: VoteConfig | null;
  /**
   * Set when this poll belongs to a club trip; null for a /plan share.
   *
   * tripTitle is the trip's own name if the proposer gave it one. The poll page
   * headlines it instead of the generic "Where should the club go?", so a club
   * running several votes can tell them apart.
   */
  club: { slug: string; name: string; tripTitle: string | null } | null;
  viewer: { loggedIn: boolean; onRoster: boolean; isCaptain: boolean };
  roster: { size: number; voted: number };
  voters: PollVoter[];
  myBallot: Ballot | null;
  results: TallyResult | null;
  /**
   * Bracket only, and only for the captain: how the live round's votes are
   * falling, plus any matchup they've called by hand. Null for everyone else —
   * a running tally on an open vote is exactly what makes late voters follow
   * the crowd, and the captain needs it to decide when to advance.
   */
  captainTally: {
    round: number;
    counts: Record<string, { a: number; b: number }>;
    overrides: Record<string, string>;
  } | null;
  /**
   * Approval/ranked, and only for the captain: the standings as they stand, so
   * the close-out review shows what closing would decide. Null for everyone else
   * — `results` stays the one field the crowd reads, and it only fills on close.
   */
  captainResults: TallyResult | null;
};

type PollRow = {
  user_id: string;
  state: SharedState;
  /** Set only when this poll is a club trip's vote; null for a /plan share. */
  club_trip_id: string | null;
  club_id: string | null;
  club_slug: string | null;
  club_name: string | null;
  /** club_trips.title — the trip's own name, null until someone sets one. */
  trip_title: string | null;
};

/** Load the raw shared_trips row, or null for a bad id / missing row. */
export async function getPollRow(pool: pg.Pool, id: string): Promise<PollRow | null> {
  if (!UUID_RE.test(id)) return null;
  // The club joins are LEFT and no-op for a /plan share (club_trip_id is null),
  // which is every row today. They're here so the captain check can consult club
  // role without a second round-trip.
  const { rows } = await pool.query(
    `SELECT s.user_id, s.state, s.club_trip_id,
            c.id AS club_id, c.slug AS club_slug, c.name AS club_name,
            t.title AS trip_title
       FROM shared_trips s
       LEFT JOIN club_trips t ON t.id = s.club_trip_id
       LEFT JOIN clubs c      ON c.id = t.club_id
      WHERE s.id = $1`,
    [id]
  );
  return rows.length ? (rows[0] as PollRow) : null;
}

/**
 * May this viewer close the poll?
 *
 * A /plan share has one captain: whoever created it (shared_trips.user_id).
 *
 * A club poll takes its captain from club role INSTEAD — not in addition. The
 * proposer's user_id deliberately confers nothing here: they may since have been
 * demoted, suspended, or removed, and closing the club's vote (which durably
 * commits a destination) is an admin act. Checking user_id first would let a
 * demoted admin keep the one power they were demoted out of.
 */
async function isPollCaptain(pool: pg.Pool, row: PollRow, viewer: Viewer): Promise<boolean> {
  if (!viewer.userId) return false;
  if (row.club_id) return canManage(await getClubViewer(row.club_id, viewer.userId, pool));
  return row.user_id === viewer.userId;
}

/**
 * May this viewer see the poll at all?
 *
 * Always true for a /plan share: the link IS the invite, and the page is
 * deliberately public (people vote before signing in). A club poll is the
 * opposite — its roster is the club's roster, which lib/clubs.canView keeps
 * private, so only members may load it.
 */
async function canViewPoll(pool: pg.Pool, row: PollRow, viewer: Viewer): Promise<boolean> {
  if (!row.club_id) return true;
  if (!viewer.userId) return false;
  return canView(await getClubViewer(row.club_id, viewer.userId, pool));
}

/**
 * Load a poll for a page/API viewer, distinguishing "no such poll" from "sign in
 * first".
 *
 * Non-members of a club get `notfound` rather than a 403 — a 403 would confirm
 * the club exists, the same reasoning as the club page. But a logged-OUT viewer
 * gets `login`, so a member opening the vote link in a signed-out browser isn't
 * told their club's vote doesn't exist.
 */
export async function loadPoll(
  id: string,
  viewer: Viewer,
  poolArg?: pg.Pool
): Promise<{ ok: true; view: PollView } | { ok: false; reason: "notfound" | "login" }> {
  const pool = poolArg ?? getPgPool();
  const row = await getPollRow(pool, id);
  if (!row) return { ok: false, reason: "notfound" };
  if (row.club_id && !viewer.userId) return { ok: false, reason: "login" };
  if (!(await canViewPoll(pool, row, viewer))) return { ok: false, reason: "notfound" };
  const view = await buildPollView(id, viewer, pool);
  return view ? { ok: true, view } : { ok: false, reason: "notfound" };
}

/**
 * If the logged-in viewer's email matches an unclaimed roster seat, bind their
 * user_id to it. Lets an invitee who logs in (possibly first time) take their
 * seat. Returns true if they hold a seat afterwards.
 */
export async function claimRosterSeat(pool: pg.Pool, id: string, viewer: Viewer): Promise<boolean> {
  if (!viewer.userId) return false;
  // Already seated by user_id?
  const mine = await pool.query(
    `SELECT 1 FROM trip_poll_voters WHERE shared_trip_id = $1 AND user_id = $2 LIMIT 1`,
    [id, viewer.userId]
  );
  if (mine.rowCount) return true;
  if (!viewer.email) return false;
  // Bind an unclaimed seat matching their email.
  const claimed = await pool.query(
    `UPDATE trip_poll_voters SET user_id = $2
       WHERE shared_trip_id = $1 AND lower(email) = lower($3) AND user_id IS NULL
       RETURNING 1`,
    [id, viewer.userId, viewer.email]
  );
  return (claimed.rowCount ?? 0) > 0;
}

/** Assemble the full poll view for a viewer (claims a seat as a side effect). */
export async function buildPollView(id: string, viewer: Viewer, poolArg?: pg.Pool): Promise<PollView | null> {
  const pool = poolArg ?? getPgPool();
  const row = await getPollRow(pool, id);
  if (!row) return null;

  // Defense in depth: loadPoll gates too, but this is the function every caller
  // reaches for, and a club poll's voter list is a private roster.
  if (!(await canViewPoll(pool, row, viewer))) return null;

  const state = row.state ?? {};
  const destinations = Array.isArray(state.destinations) ? state.destinations : [];
  const vote = coerceVoteConfig(state.vote);

  const base: PollView = {
    id,
    destinations,
    golfers: state.golfers ?? null,
    nights: state.nights ?? null,
    when: state.when ?? null,
    sharedBy: state.sharedBy ?? null,
    vote,
    club:
      row.club_slug && row.club_name
        ? { slug: row.club_slug, name: row.club_name, tripTitle: row.trip_title?.trim() || null }
        : null,
    viewer: {
      loggedIn: !!viewer.userId,
      onRoster: false,
      isCaptain: await isPollCaptain(pool, row, viewer),
    },
    roster: { size: 0, voted: 0 },
    voters: [],
    myBallot: null,
    results: null,
    captainTally: null,
    captainResults: null,
  };

  if (!vote) return base; // read-only share, no poll

  base.viewer.onRoster = await claimRosterSeat(pool, id, viewer);

  // Roster + who has voted for the current round, with display names.
  const round = vote.currentRound;
  const { rows: rosterRows } = await pool.query(
    `SELECT v.email, v.user_id, v.is_captain, u.name AS user_name,
            EXISTS (
              SELECT 1 FROM trip_poll_ballots b
              WHERE b.shared_trip_id = v.shared_trip_id AND b.user_id = v.user_id AND b.round = $2
            ) AS voted
       FROM trip_poll_voters v
       LEFT JOIN users u ON u.id::text = v.user_id
      WHERE v.shared_trip_id = $1
      ORDER BY v.is_captain DESC, v.invited_at ASC`,
    [id, round]
  );

  base.voters = rosterRows.map((r) => ({
    label: r.user_name || labelFromEmail(r.email),
    voted: !!r.voted,
    isCaptain: !!r.is_captain,
    isYou: !!viewer.userId && r.user_id === viewer.userId,
  }));
  base.roster = {
    size: rosterRows.length,
    voted: rosterRows.filter((r) => r.voted).length,
  };

  // The viewer's own ballot for this round, if any.
  if (viewer.userId) {
    const { rows: mine } = await pool.query(
      `SELECT ballot FROM trip_poll_ballots WHERE shared_trip_id = $1 AND user_id = $2 AND round = $3`,
      [id, viewer.userId, round]
    );
    base.myBallot = mine.length ? (mine[0].ballot as Ballot) : null;
  }

  // The captain sees the live bracket tally at any time — it is the whole basis
  // for deciding whether the round is ready to advance.
  if (base.viewer.isCaptain && vote.type === "bracket" && vote.bracket) {
    const { rows: ballotRows } = await pool.query(
      `SELECT ballot FROM trip_poll_ballots WHERE shared_trip_id = $1 AND round = $2`,
      [id, round]
    );
    base.captainTally = {
      round,
      counts: roundVoteCounts(
        vote.bracket as Bracket,
        round,
        ballotRows.map((b) => b.ballot as BracketBallot)
      ),
      overrides: vote.overrides ?? {},
    };
  }

  // The captain sees the one-shot standings at any time — same reason as the
  // bracket tally: closing is their call, and it shouldn't be made blind.
  if (base.viewer.isCaptain && vote.type !== "bracket") {
    const { rows: ballotRows } = await pool.query(
      `SELECT ballot FROM trip_poll_ballots WHERE shared_trip_id = $1 AND round = $2`,
      [id, round]
    );
    base.captainResults = tally(
      vote.type,
      ballotRows.map((b) => b.ballot as Ballot),
      destinations.map((d) => d.slug)
    );
  }

  // Results are revealed only once closed (avoids bandwagoning while open).
  if (vote.status === "closed" && vote.type !== "bracket") {
    const { rows: ballotRows } = await pool.query(
      `SELECT ballot FROM trip_poll_ballots WHERE shared_trip_id = $1 AND round = $2`,
      [id, round]
    );
    base.results = tally(
      vote.type,
      ballotRows.map((b) => b.ballot as Ballot),
      destinations.map((d) => d.slug)
    );
  }

  return base;
}

/**
 * Cast (or update) the viewer's ballot for the current round. Returns the
 * refreshed poll view.
 *
 * Nothing resolves here, for any vote type: the captain reviews the tally and
 * closes (or advances) by hand, so they always get the chance to override before
 * an outcome is committed.
 */
export async function castBallot(
  id: string,
  viewer: Viewer,
  rawBallot: unknown
): Promise<{ ok: true; view: PollView } | { ok: false; status: number; error: string }> {
  const pool = getPgPool();
  const row = await getPollRow(pool, id);
  if (!row) return { ok: false, status: 404, error: "Vote not found." };

  const vote = coerceVoteConfig(row.state?.vote);
  if (!vote) return { ok: false, status: 400, error: "This trip isn't set up for voting." };
  if (!viewer.userId) return { ok: false, status: 401, error: "Sign in to vote." };
  // Someone removed from the club keeps their poll seat (the roster is frozen at
  // proposal time), so the seat check below would still pass. Club membership is
  // the real gate, and it's re-read on every ballot rather than trusted from
  // when the vote opened.
  if (!(await canViewPoll(pool, row, viewer))) {
    return { ok: false, status: 404, error: "Vote not found." };
  }
  if (vote.status === "closed") return { ok: false, status: 409, error: "Voting is closed." };

  const onRoster = await claimRosterSeat(pool, id, viewer);
  if (!onRoster) return { ok: false, status: 403, error: "You're not on the invite list for this vote." };

  // Validate + shape the ballot. Bracket picks are validated against the current
  // round's matchups; approval/ranked against the destination set.
  let ballotToStore: Ballot;
  if (vote.type === "bracket") {
    const bracket = (vote.bracket ?? null) as Bracket | null;
    if (!bracket) return { ok: false, status: 400, error: "This bracket isn't ready yet." };
    const picks = rawBallot && typeof rawBallot === "object" ? (rawBallot as { picks?: unknown }).picks : undefined;
    const v = validatePicks(bracket, vote.currentRound, picks);
    if (!v.ok) return { ok: false, status: 400, error: v.error };
    ballotToStore = { picks: v.picks };
  } else {
    const destSlugs = (Array.isArray(row.state?.destinations) ? row.state!.destinations! : []).map((d) => d.slug);
    const norm = normalizeBallot(vote.type, rawBallot, destSlugs);
    if (!norm.ok) return { ok: false, status: 400, error: norm.error };
    ballotToStore = norm.ballot;
  }

  await pool.query(
    `INSERT INTO trip_poll_ballots (shared_trip_id, user_id, round, ballot)
       VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (shared_trip_id, user_id, round)
       DO UPDATE SET ballot = EXCLUDED.ballot, updated_at = now()`,
    [id, viewer.userId, vote.currentRound, JSON.stringify(ballotToStore)]
  );

  const view = await buildPollView(id, viewer, pool);
  return { ok: true, view: view! };
}

/**
 * Once a club poll closes, write the winning destination onto the club trip and
 * move it to PLANNING. No-op for a /plan share, and for a bracket that merely
 * advanced a round.
 *
 * This exists because the poll persists no winner — buildPollView re-tallies the
 * ballots on every read. That's fine for a share page, but a club needs a
 * durable answer to "where are we going" that outlives the ballots.
 */
async function recordClubWinner(pool: pg.Pool, id: string, row: PollRow): Promise<void> {
  if (!row.club_trip_id) return;

  // Re-read: the close above rewrote state.vote, and a bracket may have advanced
  // rather than closed.
  const fresh = await getPollRow(pool, id);
  const vote = coerceVoteConfig(fresh?.state?.vote);
  if (!fresh || !vote || vote.status !== "closed") return;

  let winner: string | null = null;
  if (vote.type === "bracket") {
    const bracket = (vote.bracket ?? null) as Bracket | null;
    // A bracket ALWAYS names a champion: resolveRound breaks an exact tie by
    // seed, and seeds come from a random shuffle at proposal time. So champion()
    // alone would commit the club to a destination decided by a coin flip nobody
    // saw — worse than the sort-order tie we refuse to accept below, because it
    // isn't even reproducible. A zero-ballot final counts as 0–0, i.e. a tie, so
    // this also stops an early "close now" from crowning a random winner.
    const final = bracket ? roundMatchups(bracket, bracket.rounds)[0] : null;
    if (bracket && final) {
      const { rows } = await pool.query(
        `SELECT ballot FROM trip_poll_ballots WHERE shared_trip_id = $1 AND round = $2`,
        [id, bracket.rounds]
      );
      const counts = roundVoteCounts(bracket, bracket.rounds, rows.map((b) => b.ballot as BracketBallot));
      const c = counts[final.id];
      // A call on the final is the captain settling it by hand, having read the
      // tally in the advance modal — so it locks even out of a tie. That is the
      // informed decision the seed tie-break isn't, and it's the only way a tied
      // final ever names a destination.
      const called = (vote.overrides ?? {})[final.id];
      if (called === final.a || called === final.b) winner = champion(bracket);
      else if (c && c.a !== c.b) winner = champion(bracket);
    }
  } else {
    const destSlugs = (Array.isArray(fresh.state?.destinations) ? fresh.state.destinations : []).map(
      (d) => d.slug
    );
    const { rows } = await pool.query(
      `SELECT ballot FROM trip_poll_ballots WHERE shared_trip_id = $1 AND round = $2`,
      [id, vote.currentRound]
    );
    const result = tally(vote.type, rows.map((b) => b.ballot as Ballot), destSlugs);
    // A winner the captain called in the close-out review locks outright — they
    // read the standings and decided, which is exactly what a tie needs.
    // Otherwise only an outright winner locks: an exact tie is a real outcome the
    // club has to settle itself, and taking winners[0] would resolve it silently
    // by sort order with nobody knowing a tie had happened.
    if (vote.calledWinner && destSlugs.includes(vote.calledWinner)) winner = vote.calledWinner;
    else if (result.winners.length === 1) winner = result.winners[0];
  }

  if (winner) await lockClubTripWinner(pool, row.club_trip_id, winner);
}

/**
 * Resolve the bracket's current round from its ballots, then either open the
 * next round or close the poll once a champion is crowned. Only ever reached
 * through closePoll — i.e. only when the captain says so.
 */
async function advanceBracketRound(pool: pg.Pool, id: string, vote: VoteConfig): Promise<void> {
  const bracket = (vote.bracket ?? null) as Bracket | null;
  if (!bracket || vote.status === "closed") return;

  const { rows } = await pool.query(
    `SELECT ballot FROM trip_poll_ballots WHERE shared_trip_id = $1 AND round = $2`,
    [id, vote.currentRound]
  );
  const ballots = rows.map((r) => r.ballot as BracketBallot);

  const resolved = resolveRound(bracket, vote.currentRound, ballots, vote.overrides ?? {});
  const isFinal = vote.currentRound >= resolved.rounds;
  const next: VoteConfig = {
    ...vote,
    bracket: resolved,
    currentRound: isFinal ? vote.currentRound : vote.currentRound + 1,
    status: isFinal && champion(resolved) ? "closed" : "open",
  };
  await setVoteConfig(pool, id, next);
}

/** Captain action: close the poll now and reveal results (one-shot types). */
/**
 * What the captain decided in the close-out review, as the client sends it.
 *
 * `overrides` is a bracket's per-matchup calls; `winner` is a one-shot vote's
 * called winner (null / absent = let the tally decide). Both are optional: a
 * captain who agrees with the vote sends nothing.
 */
export type CaptainCalls = { overrides?: unknown; winner?: unknown };

export async function closePoll(
  id: string,
  viewer: Viewer,
  calls: CaptainCalls = {}
): Promise<{ ok: true; view: PollView } | { ok: false; status: number; error: string }> {
  const pool = getPgPool();
  const row = await getPollRow(pool, id);
  if (!row) return { ok: false, status: 404, error: "Vote not found." };
  if (!(await isPollCaptain(pool, row, viewer))) {
    return {
      ok: false,
      status: 403,
      error: row.club_id
        ? "Only a club admin can close the vote."
        : "Only the trip's captain can close the vote.",
    };
  }
  const vote = coerceVoteConfig(row.state?.vote);
  if (!vote) return { ok: false, status: 400, error: "This trip isn't set up for voting." };
  if (vote.status === "closed") return { ok: false, status: 409, error: "Voting is already closed." };

  // Bracket: force the current round to resolve with whatever votes are in (and
  // advance / crown). The captain confirms the round in a modal first, so any
  // matchup they called by hand arrives with this request and is folded in
  // before the round resolves. One-shot: close and reveal.
  if (vote.type === "bracket") {
    const bracket = (vote.bracket ?? null) as Bracket | null;
    let toResolve = vote;
    if (bracket) {
      const merged = mergeOverrides(bracket, vote, calls.overrides);
      if (!merged.ok) return { ok: false, status: 400, error: merged.error };
      // advanceBracketRound persists {...vote}, so the calls are stored with the
      // resolved bracket rather than needing a write of their own.
      toResolve = { ...vote, overrides: merged.overrides };
    }
    await advanceBracketRound(pool, id, toResolve);
  } else {
    // A one-shot vote has no matchups to call, so the captain's override is the
    // winner itself. Stored on the config rather than applied to the ballots:
    // the standings stay exactly as the group voted them, and the call sits
    // beside them as a visible, attributable decision.
    const called = calls.winner;
    let calledWinner: string | undefined;
    if (called !== null && called !== undefined && called !== "") {
      const destSlugs = (Array.isArray(row.state?.destinations) ? row.state.destinations : []).map((d) => d.slug);
      if (typeof called !== "string" || !destSlugs.includes(called)) {
        return { ok: false, status: 400, error: "That trip isn't in this vote." };
      }
      calledWinner = called;
    }
    await setVoteConfig(pool, id, { ...vote, status: "closed", calledWinner });
  }
  await recordClubWinner(pool, id, row);

  const view = await buildPollView(id, viewer, pool);
  return { ok: true, view: view! };
}

/**
 * Fold a map of captain calls (matchup id -> winning slug, or null to clear)
 * into the vote's existing overrides.
 *
 * Only the live round can be called: earlier rounds are already resolved and
 * propagated, and later ones have no sides in them yet. A call naming a matchup
 * or trip outside that is a client bug, so it errors rather than no-opping.
 */
function mergeOverrides(
  bracket: Bracket,
  vote: VoteConfig,
  raw: unknown
): { ok: true; overrides: Record<string, string> } | { ok: false; error: string } {
  const overrides = { ...(vote.overrides ?? {}) };
  if (raw === undefined || raw === null) return { ok: true, overrides };
  if (typeof raw !== "object") return { ok: false, error: "Those matchup calls aren't readable." };

  const live = roundMatchups(bracket, vote.currentRound);
  for (const [matchupId, winner] of Object.entries(raw as Record<string, unknown>)) {
    const m = live.find((x) => x.id === matchupId);
    if (!m) return { ok: false, error: "That matchup isn't in the current round." };
    if (winner === null || winner === "" || winner === undefined) delete overrides[m.id];
    else if (winner === m.a || winner === m.b) overrides[m.id] = winner as string;
    else return { ok: false, error: "That trip isn't in this matchup." };
  }
  return { ok: true, overrides };
}

/**
 * Captain action: call a matchup by hand, or clear a call already made.
 *
 * The override is recorded, not applied — the matchup only resolves when the
 * captain advances the round. That keeps a mis-click reversible and keeps one
 * code path (advanceBracketRound) responsible for propagating winners.
 */
export async function setMatchupWinner(
  id: string,
  viewer: Viewer,
  matchupId: unknown,
  winner: unknown
): Promise<{ ok: true; view: PollView } | { ok: false; status: number; error: string }> {
  const pool = getPgPool();
  const row = await getPollRow(pool, id);
  if (!row) return { ok: false, status: 404, error: "Vote not found." };
  if (!(await isPollCaptain(pool, row, viewer))) {
    return {
      ok: false,
      status: 403,
      error: row.club_id
        ? "Only a club admin can call a matchup."
        : "Only the trip's captain can call a matchup.",
    };
  }

  const vote = coerceVoteConfig(row.state?.vote);
  if (!vote) return { ok: false, status: 400, error: "This trip isn't set up for voting." };
  if (vote.type !== "bracket") return { ok: false, status: 400, error: "This vote has no matchups." };
  if (vote.status === "closed") return { ok: false, status: 409, error: "Voting is already closed." };

  const bracket = (vote.bracket ?? null) as Bracket | null;
  if (!bracket) return { ok: false, status: 400, error: "This bracket isn't ready yet." };

  const merged = mergeOverrides(bracket, vote, { [String(matchupId)]: winner ?? null });
  if (!merged.ok) return { ok: false, status: 400, error: merged.error };

  await setVoteConfig(pool, id, { ...vote, overrides: merged.overrides });

  const view = await buildPollView(id, viewer, pool);
  return { ok: true, view: view! };
}

/** Replace the whole state.vote blob — every write to the config goes through here. */
async function setVoteConfig(pool: pg.Pool, id: string, vote: VoteConfig): Promise<void> {
  await pool.query(
    `UPDATE shared_trips SET state = jsonb_set(state, '{vote}', $2::jsonb, true) WHERE id = $1`,
    [id, JSON.stringify(vote)]
  );
}

function labelFromEmail(email: string): string {
  if (email.startsWith("captain:")) return "Captain";
  const local = email.split("@")[0] || email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}
