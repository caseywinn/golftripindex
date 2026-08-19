// lib/planVote.ts
//
// Group-vote configuration for a shared /plan trip. The config is stored on
// shared_trips.state.vote; the roster and ballots live in trip_poll_voters /
// trip_poll_ballots (see migrations/add_trip_polls.sql).
//
// Three modes, all login-gated against a closed roster of invited emails:
//   approval — voters say "yes" to any trips they'd be happy with; most yeses wins
//   ranked   — voters order the trips; Borda points decide the winner
//   bracket  — random-seeded head-to-head matchups over several rounds

export type VoteType = "approval" | "ranked" | "bracket";

export type VoteStatus = "open" | "closed";

/**
 * Poll configuration persisted at shared_trips.state.vote.
 *
 * `currentRound` is always 1 for approval/ranked and increments as a bracket
 * advances. Bracket seeding/matchup structure is added under `bracket` in the
 * bracket-engine phase; kept loosely typed here so Phase 1 stays additive.
 */
export type VoteConfig = {
  type: VoteType;
  status: VoteStatus;
  currentRound: number;
  bracket?: unknown;
  /**
   * Bracket only — the captain's manual winners, matchup id -> slug. They beat
   * the vote tally when the round resolves.
   *
   * Matchup ids (`r{round}m{index}`) are unique across the whole tournament, so
   * these accumulate rather than needing clearing between rounds, and stand as a
   * record of which calls the captain made by hand.
   */
  overrides?: Record<string, string>;
  /**
   * Approval/ranked only — the winner the captain called in the close-out
   * review, beating the tally. Set once, when the vote closes.
   *
   * A bracket has no use for this: its equivalent is an override on the final
   * matchup, which flows through the same resolution path as every other round.
   */
  calledWinner?: string;
};

export const VOTE_TYPES: { key: VoteType; label: string; blurb: string }[] = [
  {
    key: "approval",
    label: "Pick favorites",
    blurb: "Everyone marks the trips they'd be happy with. The most-picked trip wins.",
  },
  {
    key: "ranked",
    label: "Rank them",
    blurb: "Everyone puts the trips in order. Points across all ballots decide the winner.",
  },
  {
    key: "bracket",
    label: "Bracket",
    blurb: "Head-to-head matchups over several rounds, March Madness style.",
  },
];

export function isVoteType(v: unknown): v is VoteType {
  return v === "approval" || v === "ranked" || v === "bracket";
}

/** Fresh config for a newly created poll: open, on round 1. */
export function defaultVoteConfig(type: VoteType): VoteConfig {
  return { type, status: "open", currentRound: 1 };
}

/** Coerce an unknown state.vote blob into a safe VoteConfig, or null if voting is off. */
export function coerceVoteConfig(input: unknown): VoteConfig | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  if (!isVoteType(v.type)) return null;
  return {
    type: v.type,
    status: v.status === "closed" ? "closed" : "open",
    currentRound: typeof v.currentRound === "number" && v.currentRound >= 1 ? Math.floor(v.currentRound) : 1,
    bracket: v.bracket,
    overrides: coerceOverrides(v.overrides),
    calledWinner: typeof v.calledWinner === "string" && v.calledWinner ? v.calledWinner : undefined,
  };
}

/** Keep only string -> string entries; anything else in the blob is dropped. */
function coerceOverrides(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}
