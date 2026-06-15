// lib/planBracket.ts
//
// Single-elimination bracket for group votes: random seeding with byes for
// non-power-of-two fields, per-round matchup generation, and vote-driven
// advancement. Pure and DB-free — planPoll wires it to ballots and persistence.
//
// Stored at shared_trips.state.vote.bracket. A round is "votable" when its
// matchups have both sides filled; byes (one side empty) resolve automatically.

export type Matchup = {
  id: string;          // `r{round}m{index}` — stable across the whole tournament
  round: number;       // 1-based
  a: string | null;    // slug, or null for an empty slot (bye / not-yet-filled)
  b: string | null;
  winner: string | null;
};

export type Bracket = {
  seedOrder: string[]; // slugs by seed: index 0 = seed 1 (randomly assigned)
  matchups: Matchup[];
  rounds: number;
};

export type Picks = Record<string, string>; // matchupId -> chosen slug
export type BracketBallot = { picks?: Picks };

function nextPow2(n: number): number {
  let b = 1;
  while (b < n) b *= 2;
  return b;
}

/** Standard tournament seed order for a power-of-two size, e.g. 8 -> [1,8,4,5,2,7,3,6]. */
function seedPositions(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) { next.push(s); next.push(sum - s); }
    seeds = next;
  }
  return seeds;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const idxOf = (id: string): number => parseInt(id.split("m")[1], 10);

function find(bracket: Bracket, round: number, idx: number): Matchup | undefined {
  return bracket.matchups.find((m) => m.id === `r${round}m${idx}`);
}

/** Matchups in a round, ordered by index. */
export function roundMatchups(bracket: Bracket, round: number): Matchup[] {
  return bracket.matchups.filter((m) => m.round === round).sort((x, y) => idxOf(x.id) - idxOf(y.id));
}

/** A real, undecided matchup that needs a vote (both sides present, no winner). */
export function isVotable(m: Matchup): boolean {
  return !!m.a && !!m.b && !m.winner;
}

/** A bye: exactly one side present — advances for free. */
function isBye(m: Matchup): boolean {
  return (!!m.a) !== (!!m.b);
}

function seedOf(bracket: Bracket, slug: string): number {
  const i = bracket.seedOrder.indexOf(slug);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i + 1;
}

/** Drop a matchup's winner into its parent slot in the next round. */
function propagate(bracket: Bracket, m: Matchup): void {
  if (m.round >= bracket.rounds || !m.winner) return;
  const child = find(bracket, m.round + 1, Math.floor(idxOf(m.id) / 2));
  if (!child) return;
  if (idxOf(m.id) % 2 === 0) child.a = m.winner;
  else child.b = m.winner;
}

/** Build a fresh bracket from the destination slugs, byes resolved up front. */
export function createBracket(slugs: string[], rand: () => number = Math.random): Bracket {
  const n = slugs.length;
  const size = nextPow2(Math.max(2, n));
  const rounds = Math.log2(size);
  const seedOrder = shuffle(slugs, rand);
  const slugForSeed = (seed: number): string | null => (seed >= 1 && seed <= n ? seedOrder[seed - 1] : null);

  const matchups: Matchup[] = [];
  const positions = seedPositions(size);
  for (let k = 0; k < size / 2; k++) {
    matchups.push({
      id: `r1m${k}`,
      round: 1,
      a: slugForSeed(positions[2 * k]),
      b: slugForSeed(positions[2 * k + 1]),
      winner: null,
    });
  }
  for (let r = 2; r <= rounds; r++) {
    for (let m = 0; m < size / 2 ** r; m++) {
      matchups.push({ id: `r${r}m${m}`, round: r, a: null, b: null, winner: null });
    }
  }

  const bracket: Bracket = { seedOrder, matchups, rounds };
  // Byes only ever occur in round 1 (size/2 < n), so resolve them once here.
  for (const m of roundMatchups(bracket, 1)) {
    if (isBye(m)) { m.winner = m.a ?? m.b; propagate(bracket, m); }
  }
  return bracket;
}

/** Validate a submitted ballot covers every votable matchup of the round. */
export function validatePicks(
  bracket: Bracket,
  round: number,
  raw: unknown
): { ok: true; picks: Picks } | { ok: false; error: string } {
  const picksIn = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const picks: Picks = {};
  for (const m of roundMatchups(bracket, round).filter(isVotable)) {
    const choice = String(picksIn[m.id] ?? "");
    if (choice !== m.a && choice !== m.b) return { ok: false, error: "Pick a winner for every matchup." };
    picks[m.id] = choice;
  }
  return { ok: true, picks };
}

/** Per-matchup vote counts for a round (for revealing a finished round). */
export function roundVoteCounts(
  bracket: Bracket,
  round: number,
  ballots: BracketBallot[]
): Record<string, { a: number; b: number }> {
  const out: Record<string, { a: number; b: number }> = {};
  for (const m of roundMatchups(bracket, round)) {
    if (!m.a || !m.b) continue;
    let a = 0, b = 0;
    for (const bl of ballots) {
      const pick = bl.picks?.[m.id];
      if (pick === m.a) a++;
      else if (pick === m.b) b++;
    }
    out[m.id] = { a, b };
  }
  return out;
}

/**
 * Resolve a round from its ballots and fill the next round. Majority wins; an
 * exact tie goes to the better (lower) seed. Returns a new bracket; the input is
 * left untouched.
 */
export function resolveRound(bracket: Bracket, round: number, ballots: BracketBallot[]): Bracket {
  const next: Bracket = JSON.parse(JSON.stringify(bracket));
  const counts = roundVoteCounts(next, round, ballots);
  for (const m of roundMatchups(next, round)) {
    if (m.winner || !m.a || !m.b) continue;
    const { a, b } = counts[m.id] ?? { a: 0, b: 0 };
    m.winner = a > b ? m.a : b > a ? m.b : (seedOf(next, m.a) <= seedOf(next, m.b) ? m.a : m.b);
    propagate(next, m);
  }
  return next;
}

/** The tournament champion, or null while it's still in progress. */
export function champion(bracket: Bracket): string | null {
  return find(bracket, bracket.rounds, 0)?.winner ?? null;
}

/** Human label for a round given the total: Final / Semifinals / Quarterfinals / Round N. */
export function roundLabel(round: number, rounds: number): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
}
