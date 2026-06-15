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
  };
}
