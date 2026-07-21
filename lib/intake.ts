import { COST_TIERS, DURATION_RANGES, REGIONS, SEASONS } from "@/lib/filters";
import type { FilterArgs } from "@/lib/tripFilter";

// ── /plan intake questionnaire ──────────────────────────────────────────────
// Step 1 of the trip planner asks a few structured questions, then hands the
// answers straight to runFilter — no LLM. Answers key to the existing chip
// vocabulary (COST_TIERS / DURATION_RANGES / REGIONS / SEASONS slugs) so the
// wizard's picks can pre-set the same filter chips the grid already exposes.
// Only vibe and ambition are intake-specific.

// Curated mood buttons. Each maps to one or more REAL catalog Vibe tags (verified
// against the live base); vibe is OR-matched in runFilter, so any listed tag is a
// hit. Kept to a friendly handful rather than dumping all 26 tags — the golf
// intensity axis lives in AMBITION_CHOICES, so these lean toward company/mood.
export const VIBE_CHOICES = [
  { slug: "buddies", label: "Buddies trip", tags: ["Buddy Trip Classic", "Nearby Nightlife"] },
  { slug: "bachelor", label: "Bachelor party", tags: ["Bachelor Party", "Party Atmosphere"] },
  { slug: "couples", label: "Couples getaway", tags: ["Couples Trip"] },
  { slug: "family", label: "Family", tags: ["Family Vacation"] },
  { slug: "luxury", label: "Luxury & resort", tags: ["Luxury Retreat", "Resort Style"] },
  { slug: "value", label: "Value hunt", tags: ["Value Crawl", "Hidden Gem"] },
  { slug: "warm", label: "Warm & sunny", tags: ["Sun & Warmth", "Desert Golf", "Coastal"] },
  { slug: "remote", label: "Remote & rugged", tags: ["Wild & Remote", "Rugged & Windswept", "Mountain Escape"] },
] as const;

// Golf-intensity posture. Drives top-100 filtering + result order, not vibe tags.
export const AMBITION_CHOICES = [
  { slug: "bucket-list", label: "Bucket-list courses", hint: "Rank by Top 100 courses" },
  { slug: "balanced", label: "A bit of both", hint: "Great golf, great time" },
  { slug: "just-fun", label: "Just a great trip", hint: "Rank by overall experience" },
] as const;

export type IntakeAnswers = {
  budget?: string; // COST_TIERS slug
  length?: string; // DURATION_RANGES slug
  seasons?: string[]; // SEASONS slugs
  regions?: string[]; // REGIONS slugs
  vibes?: string[]; // VIBE_CHOICES slugs
  ambition?: string; // AMBITION_CHOICES slug
};

// Deterministic map from questionnaire answers to a runFilter query. Every field
// is optional; an unset answer omits its key, and an all-skipped intake yields an
// empty query → the full ranked catalog (same as landing on /plan today).
export function intakeToFilterArgs(a: IntakeAnswers): FilterArgs {
  const f: FilterArgs = {};

  if (a.budget) {
    const def = COST_TIERS.find((c) => c.slug === a.budget);
    if (def) {
      f.minCostTier = Math.min(...def.tiers);
      f.maxCostTier = Math.max(...def.tiers);
    }
  }

  if (a.length) {
    const def = DURATION_RANGES.find((d) => d.slug === a.length);
    if (def) {
      f.minNights = def.minDays;
      f.maxNights = def.maxDays;
    }
  }

  if (a.seasons?.length) {
    const valid = a.seasons.filter((s) => SEASONS.some((x) => x.slug === s));
    if (valid.length) f.seasons = valid;
  }

  if (a.regions?.length) {
    // runFilter slugifies both sides, so passing region slugs matches the
    // label-valued t.region correctly.
    const valid = a.regions.filter((r) => REGIONS.some((x) => x.slug === r));
    if (valid.length) f.regions = valid;
  }

  if (a.vibes?.length) {
    const tags = a.vibes.flatMap(
      (v) => VIBE_CHOICES.find((x) => x.slug === v)?.tags ?? []
    );
    if (tags.length) f.vibe = tags;
  }

  if (a.ambition === "bucket-list") {
    f.minTop100 = 1;
    f.sortBy = "top100";
  } else if (a.ambition === "just-fun") {
    f.sortBy = "rating";
  }
  // "balanced" (and unset) → default ranking; no keys added.

  return f;
}
