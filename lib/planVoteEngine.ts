// lib/planVoteEngine.ts
//
// Pure, DB-free logic for group votes: validating a submitted ballot against the
// destination set, and tallying ballots into a result. Bracket round mechanics
// (seeding, matchup generation, advancement) arrive with the bracket engine; here
// bracket ballots are only shape-checked so they can be stored.

import type { VoteType } from "./planVote";

export type Ballot = Record<string, unknown>;

export type NormalizeResult =
  | { ok: true; ballot: Ballot }
  | { ok: false; error: string };

/**
 * Validate + normalize a submitted ballot for a given vote type. `destSlugs` is
 * the canonical destination set for the trip.
 *
 *   approval — { approve: slug[] }  (1+ distinct slugs from the set)
 *   ranked   — { order:   slug[] }  (a full ordering of the set, best first)
 *   bracket  — { picks: { [matchupId]: slug } }  (shape only for now)
 */
export function normalizeBallot(type: VoteType, raw: unknown, destSlugs: string[]): NormalizeResult {
  const valid = new Set(destSlugs);
  const ballot = (raw && typeof raw === "object" ? raw : {}) as Ballot;

  if (type === "approval") {
    const approve = Array.isArray(ballot.approve) ? ballot.approve.map(String) : [];
    const picked = Array.from(new Set(approve)).filter((s) => valid.has(s));
    if (picked.length === 0) return { ok: false, error: "Pick at least one trip." };
    return { ok: true, ballot: { approve: picked } };
  }

  if (type === "ranked") {
    const order = Array.isArray(ballot.order) ? ballot.order.map(String) : [];
    const deduped = Array.from(new Set(order));
    const allValid = deduped.every((s) => valid.has(s));
    if (!allValid || deduped.length !== destSlugs.length) {
      return { ok: false, error: "Rank all of the trips before submitting." };
    }
    return { ok: true, ballot: { order: deduped } };
  }

  // bracket — store the per-matchup picks; matchup-level validation lands with
  // the bracket engine, which knows the current round's matchups.
  const picks = ballot.picks && typeof ballot.picks === "object" ? (ballot.picks as Record<string, unknown>) : {};
  const clean: Record<string, string> = {};
  for (const [mid, slug] of Object.entries(picks)) {
    if (valid.has(String(slug))) clean[mid] = String(slug);
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: "Pick a winner for each matchup." };
  return { ok: true, ballot: { picks: clean } };
}

// ── Tally ────────────────────────────────────────────────────────────────────

export type TallyRow = { slug: string; score: number };

export type TallyResult = {
  type: VoteType;
  /** Per-destination score, highest first. Score = approvals / Borda points. */
  rows: TallyRow[];
  /** Winning slug(s) — more than one only on an exact tie. */
  winners: string[];
  /** Number of ballots counted. */
  ballotCount: number;
};

/** Approval: score = number of "yes" marks. */
export function tallyApproval(ballots: Ballot[], destSlugs: string[]): TallyResult {
  const counts = new Map<string, number>(destSlugs.map((s) => [s, 0]));
  for (const b of ballots) {
    const approve = Array.isArray(b.approve) ? b.approve.map(String) : [];
    for (const s of new Set(approve)) if (counts.has(s)) counts.set(s, counts.get(s)! + 1);
  }
  return finishTally("approval", counts, ballots.length);
}

/** Ranked: Borda count — 1st of N earns N points, last earns 1. */
export function tallyRanked(ballots: Ballot[], destSlugs: string[]): TallyResult {
  const n = destSlugs.length;
  const points = new Map<string, number>(destSlugs.map((s) => [s, 0]));
  for (const b of ballots) {
    const order = Array.isArray(b.order) ? b.order.map(String) : [];
    order.forEach((slug, idx) => {
      if (points.has(slug)) points.set(slug, points.get(slug)! + (n - idx));
    });
  }
  return finishTally("ranked", points, ballots.length);
}

export function tally(type: VoteType, ballots: Ballot[], destSlugs: string[]): TallyResult {
  if (type === "ranked") return tallyRanked(ballots, destSlugs);
  // Bracket results are derived from its own round structure; until the bracket
  // engine lands, fall back to approval-style counting of stored picks is not
  // meaningful, so callers should not request a bracket tally here.
  return tallyApproval(ballots, destSlugs);
}

function finishTally(type: VoteType, scores: Map<string, number>, ballotCount: number): TallyResult {
  const rows = Array.from(scores.entries())
    .map(([slug, score]) => ({ slug, score }))
    .sort((a, b) => b.score - a.score);
  const top = rows.length ? rows[0].score : 0;
  const winners = top > 0 ? rows.filter((r) => r.score === top).map((r) => r.slug) : [];
  return { type, rows, winners, ballotCount };
}
