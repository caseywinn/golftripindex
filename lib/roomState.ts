// lib/roomState.ts

export type Flow = "none" | "planning" | "trip_details" | "browse";

export type Season = "winter" | "spring" | "summer" | "fall";

export type LeadTimePref = "short" | "medium" | "long";

/**
 * RoomState is the persistent conversational memory for a room.
 * Keep it compact, stable, and UI/route friendly.
 */
export type RoomState = {
  // Guided conversation control
  flow: Flow;
  step: string; // e.g. "entry" | "planning.vibe" | "trip_details.pick" | "freeform"

  // Active context anchors
  activeTripSlug?: string; // when user is “in” a specific trip context
  activeState?: string; // e.g. "WI", "CA" (2-letter preferred), or "Wisconsin" if needed

  // Preferences gathered during planning
  preferences?: {
    vibe?: string[]; // freeform tags, e.g. ["pure_golf", "buddy_trip", "architecture"]
    durationDays?: number; // target days; optional
    durationMinDays?: number;
    durationMaxDays?: number;

    costTier?: Array<1 | 2 | 3 | 4 | 5>; // allow multiple tiers
    top100Bias?: boolean; // wants top-100-heavy itineraries
    season?: Season;
    leadTime?: LeadTimePref; // rough planning horizon
  };

  // Lightweight retrieval breadcrumbs (for continuity + debugging)
  last?: {
    userQuery?: string;
    gtiSearchQuery?: string;
    tripSlugs?: string[];
    courseSlugs?: string[];
  };
};

type AnyObj = Record<string, any>;

function isPlainObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Default empty state for a new room.
 */
export function defaultRoomState(): RoomState {
  return {
    flow: "none",
    step: "entry",
    preferences: {},
    last: {},
  };
}

/**
 * Coerce unknown JSON into a safe RoomState. This prevents runtime failures
 * when older state blobs or malformed JSON exist.
 */
export function coerceRoomState(input: any): RoomState {
  const d = defaultRoomState();
  if (!isPlainObject(input)) return d;

  const flow: Flow =
    input.flow === "planning" || input.flow === "trip_details" || input.flow === "browse" || input.flow === "none"
      ? input.flow
      : d.flow;

  const step = typeof input.step === "string" && input.step.trim() ? input.step : d.step;

  const activeTripSlug = typeof input.activeTripSlug === "string" ? input.activeTripSlug : undefined;
  const activeState = typeof input.activeState === "string" ? input.activeState : undefined;

  const preferences = isPlainObject(input.preferences) ? input.preferences : {};
  const last = isPlainObject(input.last) ? input.last : {};

  return {
    ...d,
    flow,
    step,
    activeTripSlug,
    activeState,
    preferences: {
      ...d.preferences,
      ...preferences,
    },
    last: {
      ...d.last,
      ...last,
    },
  };
}

/**
 * Merge helper used by /chat to apply a partial patch to prior state.
 *
 * - Arrays are merged with de-dupe
 * - Objects are merged recursively
 * - Primitives overwrite
 * - null/undefined are ignored
 */
export function mergeRoomState<T extends AnyObj>(prev: T, patch: AnyObj): T {
  const next: AnyObj = { ...(prev || {}) };

  for (const [key, val] of Object.entries(patch || {})) {
    if (val === null || typeof val === "undefined") continue;

    // merge arrays with dedupe (stringified for stability)
    if (Array.isArray(val)) {
      const existing = Array.isArray(next[key]) ? next[key] : [];
      next[key] = Array.from(new Set([...existing, ...val].map(String)));
      continue;
    }

    // merge nested objects
    if (isPlainObject(val)) {
      next[key] = mergeRoomState(isPlainObject(next[key]) ? next[key] : {}, val);
      continue;
    }

    // primitives overwrite
    next[key] = val;
  }

  return next as T;
}

/**
 * Convenience for applying a patch safely (coerce -> merge -> coerce).
 * This keeps state normalized and prevents drift.
 */
export function applyRoomStatePatch(prev: any, patch: AnyObj): RoomState {
  const safePrev = coerceRoomState(prev);
  const merged = mergeRoomState<RoomState>(safePrev as any, patch);
  return coerceRoomState(merged);
}
