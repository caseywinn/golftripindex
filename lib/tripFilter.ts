import type { CaddieTrip } from "@/lib/airtable";
import { slugifyState } from "@/lib/filters";

// ── Deterministic trip filter engine ────────────────────────────────────────
// The single source of truth for turning structured criteria into a complete,
// correctly ordered set of GTI trips. Shared by the Caddie route (which has a
// model extract FilterArgs via the filter_trips tool) and the /plan intake
// step (which builds FilterArgs directly from the questionnaire). Pure functions
// over CaddieTrip[]; no OpenAI, no I/O.

export type FilterArgs = {
  months?: string[];
  seasons?: string[];
  regions?: string[];
  states?: string[];
  minCostTier?: number;
  maxCostTier?: number;
  minNights?: number;
  maxNights?: number;
  vibe?: string[];
  minTop100?: number;
  accessType?: string;
  walkable?: boolean;
  courseOrArchitect?: string;
  sortBy?: "ranking" | "rating" | "top100" | "value" | "cost_asc" | "cost_desc";
};

// ── Course / architect / style matching ─────────────────────────────────────
// Matches a single clean value (one full course name, architect, or style —
// abbreviations already expanded upstream). Returns the set of matching trip
// slugs.

// Architect fields are inconsistent free text: the SAME firm appears as
// "Coore & Crenshaw", "Bill Coore; Ben Crenshaw", and "Ben Crenshaw; Bill
// Coore". A naive contiguous-substring match against the full query is
// therefore order-, separator-, and first-name-dependent — "Coore Crenshaw"
// finds 0, "Coore & Crenshaw" finds 6, "Coore" finds 12. We instead tokenize
// both sides and match when one token set is a subset of the other, so any
// phrasing of a designer resolves to the same trips.
const ARCHITECT_NOISE = new Set([
  "and", "the", "of", "jr", "sr", "ii", "iii",
  "designed", "by", "with", "redesign", "original", "design", "golf",
]);

// Lowercase, treat & , / ; + . as separators, drop noise + sub-3-char tokens
// (initials, "of", etc.) so only distinctive name parts remain.
function architectTokens(value: string | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .replace(/[&,/;+.]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 3 && !ARCHITECT_NOISE.has(t));
}

// One token set is contained in the other (order-independent), and the
// contained side carries at least one ≥4-char token. The length guard stops a
// bare common first name ("tom") from matching every Tom while still letting a
// distinctive surname ("coore", "doak") match on its own.
function architectMatch(queryTokens: string[], arch: string | undefined): boolean {
  const aToks = architectTokens(arch);
  if (!queryTokens.length || !aToks.length) return false;
  const aSet = new Set(aToks);
  const qSet = new Set(queryTokens);
  if (queryTokens.every((t) => aSet.has(t)) && queryTokens.some((t) => t.length >= 4)) return true;
  if (aToks.every((t) => qSet.has(t)) && aToks.some((t) => t.length >= 4)) return true;
  return false;
}

export function matchCourseOrArchitect(query: string, pool: CaddieTrip[]): Set<string> {
  const q = query.toLowerCase().trim();
  const matched = new Set<string>();
  if (!q) return matched;

  const queryTokens = architectTokens(query);

  for (const trip of pool) {
    for (const { course: c } of trip.courses) {
      const name = c.name?.toLowerCase() ?? "";
      const styles = (c.courseStyle ?? []).map((s) => s.toLowerCase());
      if (
        architectMatch(queryTokens, c.architect) ||
        (name.length >= 4 && (name.includes(q) || q.includes(name))) ||
        styles.some((s) => s === q || s.includes(q) || q.includes(s))
      ) {
        matched.add(trip.slug);
        break;
      }
    }
  }
  return matched;
}

// Count of the trip's courses ranked in the GTI Top 100 (Consolidated Ranking
// ≤ 100) — the source of truth for "most Top 100 courses" requests.
export function tripTop100Count(t: CaddieTrip): number {
  return t.courses.filter(
    ({ course: c }) => typeof c.consolidatedRanking === "number" && c.consolidatedRanking <= 100
  ).length;
}

// ── Timing (month / season) ──────────────────────────────────────────────────
// "Best trips in January", "good golf in fall" etc. are answered from each
// trip's Peak / Shoulder / Bad / Closed Months in Airtable, not a guess.
// Peak-month trips first, then Shoulder; within a tier, by site ranking.
// Trips whose requested window is Bad/Closed (or absent) are not surfaced.

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SEASON_TO_MONTHS: Record<string, string[]> = {
  spring: ["March", "April", "May"],
  summer: ["June", "July", "August"],
  fall: ["September", "October", "November"],
  autumn: ["September", "October", "November"],
  winter: ["December", "January", "February"],
};

type TimedTrip = { trip: CaddieTrip; tier: 0 | 1 }; // 0 = peak, 1 = shoulder

function timingMatchedTrips(pool: CaddieTrip[], months: string[]): TimedTrip[] {
  const want = new Set(months);
  const rows: TimedTrip[] = [];

  for (const trip of pool) {
    const peak = (trip.peakMonths ?? []).some((m) => want.has(m));
    const shoulder = (trip.shoulderMonths ?? []).some((m) => want.has(m));
    // Bad/Closed months are excluded by virtue of not being Peak/Shoulder.
    if (peak) rows.push({ trip, tier: 0 });
    else if (shoulder) rows.push({ trip, tier: 1 });
  }

  rows.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.trip.currentRanking ?? 9999) - (b.trip.currentRanking ?? 9999)
  );
  return rows;
}

// ── filter_trips: deterministic filter engine ───────────────────────────────
// Runs the actual filter + ordering against the catalog so the result set is
// always complete and correctly ordered. Timing (peak→shoulder) wins the sort;
// sortBy is the tiebreak.

export function runFilter(args: FilterArgs, pool: CaddieTrip[]): CaddieTrip[] {
  // 1. Timing: months + seasons → normalized month set → peak/shoulder tiers.
  const months = new Set<string>();
  for (const m of args.months ?? []) {
    const norm = MONTH_NAMES.find((n) => n.toLowerCase() === m.toLowerCase());
    if (norm) months.add(norm);
  }
  for (const s of args.seasons ?? []) {
    (SEASON_TO_MONTHS[s.toLowerCase()] ?? []).forEach((m) => months.add(m));
  }

  const hasTiming = months.size > 0;
  const tierBySlug = new Map<string, 0 | 1>();
  let working = pool;
  if (hasTiming) {
    const rows = timingMatchedTrips(pool, [...months]);
    rows.forEach((r) => tierBySlug.set(r.trip.slug, r.tier));
    working = rows.map((r) => r.trip);
  }

  // 2. Specific course / architect / style free-text.
  if (args.courseOrArchitect?.trim()) {
    const matched = matchCourseOrArchitect(args.courseOrArchitect, working);
    working = working.filter((t) => matched.has(t.slug));
  }

  // 3. Structured facets.
  working = working.filter((t) => {
    if (args.regions?.length) {
      const want = args.regions.map((r) => slugifyState(r));
      if (!t.region || !want.includes(slugifyState(t.region))) return false;
    }
    if (args.states?.length) {
      const want = args.states.map((s) => s.toLowerCase());
      if (!t.state || !want.includes(t.state.toLowerCase())) return false;
    }
    if (args.minCostTier != null && t.costTier < args.minCostTier) return false;
    if (args.maxCostTier != null && t.costTier > args.maxCostTier) return false;
    // Length: bucket a trip by its longest length (durationMaxDays), so a "6+
    // days" request keeps any trip that can run 6+ days.
    if (args.minNights != null && t.durationMaxDays < args.minNights) return false;
    if (args.maxNights != null && t.durationMaxDays > args.maxNights) return false;
    // Vibe is OR-matched: a mood expands into several synonym tags (e.g. "boys
    // trip" → Bachelor Party / Party Atmosphere / Buddy Trip Classic), and a
    // trip carrying ANY of them is a fair match. AND-matching here would make
    // synonym expansion return nothing.
    if (args.vibe?.length) {
      const have = new Set((t.vibe ?? []).map((v) => v.toLowerCase()));
      if (!args.vibe.some((v) => have.has(v.toLowerCase()))) return false;
    }
    if (args.minTop100 != null && tripTop100Count(t) < args.minTop100) return false;
    if (args.accessType?.trim()) {
      const want = args.accessType.toLowerCase();
      if (!t.courses.some(({ course: c }) => c.accessType?.toLowerCase().includes(want))) return false;
    }
    if (args.walkable && !t.courses.some(({ course: c }) => c.walkFriendly)) return false;
    return true;
  });

  // 4. Order. Timing tiers (peak→shoulder) win; sortBy is the tiebreak, or the
  // sole key when there's no timing. Default: GTI site ranking.
  const by = args.sortBy ?? "ranking";
  const tiebreak = (a: CaddieTrip, b: CaddieTrip): number => {
    switch (by) {
      case "rating": return b.overallRating - a.overallRating;
      case "top100": return tripTop100Count(b) - tripTop100Count(a) || (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999);
      case "value": return (b.valueRating ?? -1) - (a.valueRating ?? -1);
      case "cost_asc": return a.costTier - b.costTier;
      case "cost_desc": return b.costTier - a.costTier;
      default: return (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999);
    }
  };
  working.sort((a, b) => {
    if (hasTiming) {
      const ta = tierBySlug.get(a.slug) ?? 9;
      const tb = tierBySlug.get(b.slug) ?? 9;
      if (ta !== tb) return ta - tb;
    }
    return tiebreak(a, b);
  });
  return working;
}
