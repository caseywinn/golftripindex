import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAllTripsWithCoursesForCaddie } from "@/lib/airtable";
import type { CaddieTrip } from "@/lib/airtable";
import { REGIONS, slugifyState } from "@/lib/filters";

// ── Module-level cache (1 hour TTL — Airtable updated monthly) ─────────────

let _cache: CaddieTrip[] | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function getCaddieData(): Promise<CaddieTrip[]> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;
  _cache = await getAllTripsWithCoursesForCaddie();
  _cacheTime = Date.now();
  return _cache;
}

// ── Serialise a trip into a compact text block for the prompt ──────────────

function dollarStr(tier: number): string {
  return "$".repeat(Math.min(5, Math.max(1, tier)));
}

// Collapse whitespace and cap to a short, sentence-aware snippet so logistics
// prose contributes a bounded number of tokens to the system prompt.
function snippet(s: string, max = 160): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return stop > 60 ? cut.slice(0, stop + 1) : cut.trimEnd() + "…";
}

function serializeTrip(t: CaddieTrip): string {
  const lines: string[] = [];

  const rank = t.currentRanking ? `[#${t.currentRanking}]` : "";
  lines.push(`--- TRIP: ${t.name} ${rank}`);
  lines.push(`Slug: ${t.slug}`);

  const meta = [
    t.region && `Region: ${t.region}`,
    t.state && `State: ${t.state}`,
    `Cost: ${dollarStr(t.costTier)}`,
    `Duration: ${t.durationMinDays}–${t.durationMaxDays} days`,
    t.stayType && `Stay: ${t.stayType}`,
  ].filter(Boolean).join(" | ");
  lines.push(meta);

  const ratings = [
    `Overall: ${t.overallRating.toFixed(2)}`,
    `Golf: ${t.golfRating.toFixed(1)}`,
    `Lodging: ${t.lodgingRating.toFixed(1)}`,
    `Food: ${t.foodRating.toFixed(1)}`,
    `Vibe: ${t.vibeRating.toFixed(1)}`,
    t.beyondGolfRating != null && `Beyond Golf: ${t.beyondGolfRating.toFixed(1)}`,
    t.valueRating != null && `Value: ${t.valueRating.toFixed(1)}`,
    t.logisticsRating != null && `Logistics: ${t.logisticsRating.toFixed(1)}`,
  ].filter(Boolean).join(", ");
  lines.push(`Ratings: ${ratings}`);

  if (t.seasons?.length) lines.push(`Best seasons: ${t.seasons.join(", ")}`);
  // Month-level timing (the source of truth for "best in <month>" questions).
  if (t.peakMonths?.length) lines.push(`Peak months: ${t.peakMonths.join(", ")}`);
  if (t.shoulderMonths?.length) lines.push(`Shoulder months: ${t.shoulderMonths.join(", ")}`);
  if (t.badMonths?.length) lines.push(`Poor months: ${t.badMonths.join(", ")}`);
  if (t.closedMonths?.length) lines.push(`Closed months: ${t.closedMonths.join(", ")}`);
  if (t.peakVerdict) lines.push(`Peak timing: ${snippet(t.peakVerdict)}`);
  if (t.shoulderVerdict) lines.push(`Shoulder timing: ${snippet(t.shoulderVerdict)}`);
  if (t.offSeasonVerdict) lines.push(`Off-season timing: ${snippet(t.offSeasonVerdict)}`);
  if (t.vibe?.length) lines.push(`Vibe: ${t.vibe.join(", ")}`);
  // Count Top 100 courses from the trip's actual courses + their GTI Consolidated
  // Ranking (≤100), not the trip-level rollup field — that is the source of truth.
  const top100Count = tripTop100Count(t);
  if (top100Count) lines.push(`Top 100 courses: ${top100Count}`);
  if (t.leadTime) lines.push(`Lead time: ${t.leadTime}`);
  if (t.driving) lines.push(`Driving: ${t.driving}`);
  if (t.costNote) lines.push(`Cost notes: ${t.costNote}`);

  // Heavy editorial prose (overview/verdict/lodging/dining) is intentionally
  // omitted — it dominated the prompt's token count and isn't needed to match
  // trips to a request. Keep the short, high-signal fit lines; cap the
  // logistics notes to a snippet.
  if (t.fitYes) lines.push(`Best for: ${snippet(t.fitYes, 220)}`);
  if (t.fitNo) lines.push(`Not for: ${snippet(t.fitNo, 220)}`);
  if (t.teeTimeRules) lines.push(`Tee time rules: ${snippet(t.teeTimeRules)}`);
  if (t.commonMistakes) lines.push(`Common mistakes: ${snippet(t.commonMistakes)}`);

  if (t.courses.length > 0) {
    lines.push("Courses:");
    for (const { course: c, status } of t.courses) {
      const parts = [c.name];
      if (c.architect) parts.push(c.architect);
      if (c.yearOpened) parts.push(String(c.yearOpened));
      if (c.consolidatedRanking) parts.push(`GTI Rank #${c.consolidatedRanking}`);
      if (c.accessType) parts.push(c.accessType);
      if (c.courseStyle?.length) parts.push(c.courseStyle.join("/"));
      if (status) parts.push(status.replace("_", " "));
      if (c.greenFeePeak) parts.push(`Peak $${c.greenFeePeak}`);
      if (c.walkFriendly) parts.push("walk friendly");
      // c.dataDump omitted — long free-text that ballooned the prompt.
      lines.push(`  • ${parts.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

// ── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(trips: CaddieTrip[]): string {
  const tripBlocks = trips.map(serializeTrip).join("\n\n");

  return `You are the GTI Caddie, an expert golf trip advisor for Golf Trip Index (GTI) — the definitive guide to America's best golf trips, ranked by courses, lodging, food, cost, and vibe.

You are a knowledgeable, opinionated golf friend. You speak with authority about golf courses, architects, design philosophy, course conditions, lodging, dining, nightlife, and logistics. You are direct, specific, and honest about trade-offs.

FINDING TRIPS — use the filter_trips tool:
- For ANY request to find, recommend, narrow, or list trips, call filter_trips with the matching criteria. The grid the user sees is populated from the tool's results, so never hand-pick trips from memory or filter them yourself.
- This includes implicit requests and moods ("I love links golf", "walkable public courses", "something like Bandon Dunes", "where should we go in October", "cheap buddies trip", "plan a boys trip", "an underrated getaway").
- Prefer acting over asking. If the request implies ANY criteria — a vibe/mood, month, region, budget, length, course, architect, ranking — call filter_trips right away with those criteria; do not ask clarifying questions first. You can refine after seeing results. Only ask a question when the request contains no usable criteria at all.
- If the user names a specific course, architect, or design style and wants to find or play it ("best Coore & Crenshaw courses", "trips with a Doak course", "links golf"), call filter_trips with courseOrArchitect so the grid shows the matching GTI trips.
- After the tool returns, write a short, opinionated recommendation that discusses ONLY the returned trips, in the order returned (best first). Do not introduce trips the tool didn't return, and don't claim a different ordering.
- Answer directly WITHOUT the tool only for pure golf-knowledge questions that are not about finding a GTI trip: architecture history, designer biographies, "who designed X", rules, and etiquette.

RESPONSE STYLE:
- Respond in markdown. When you mention a specific GTI trip by name, format it as [Trip Name](trip:slug) using that trip's Slug from the data below, so the user can click through.

PERSONA RULES:
- Never mention "the database", "my data", "records", "the tool", or any data source/mechanism
- Never say you are an AI or reference your training
- If you don't know something specific, say so naturally

TRIP DATA (${trips.length} trips):
${tripBlocks}`;
}

// ── Course / architect / style matching ─────────────────────────────────────
// Matches a single clean value (the model passes one full course name,
// architect, or style into courseOrArchitect — abbreviations already expanded).
// Substring both directions so "David McLay Kidd" hits only DMK's courses, not
// every architect named David, while "Coore" still finds "Bill Coore & Ben
// Crenshaw". Returns the set of matching trip slugs.
function matchCourseOrArchitect(query: string, pool: CaddieTrip[]): Set<string> {
  const q = query.toLowerCase().trim();
  const matched = new Set<string>();
  if (!q) return matched;

  for (const trip of pool) {
    for (const { course: c } of trip.courses) {
      const arch = c.architect?.toLowerCase() ?? "";
      const name = c.name?.toLowerCase() ?? "";
      const styles = (c.courseStyle ?? []).map((s) => s.toLowerCase());
      if (
        // Architect: the course's architect field must CONTAIN the query — one
        // direction only. "coore" → "bill coore & ben crenshaw" ✓; "david mclay
        // kidd" → only DMK's courses, never a course merely co-listing a short
        // partial that happens to sit inside the query string.
        (arch.length >= 3 && arch.includes(q)) ||
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
function tripTop100Count(t: CaddieTrip): number {
  return t.courses.filter(
    ({ course: c }) => typeof c.consolidatedRanking === "number" && c.consolidatedRanking <= 100
  ).length;
}

// ── Timing (month / season) ──────────────────────────────────────────────────
// "Best trips in January", "good golf in fall" etc. are answered from each
// trip's Peak / Shoulder / Bad / Closed Months in Airtable, not the model's
// guess. Peak-month trips first, then Shoulder; within a tier, by site ranking.
// Trips whose requested window is Bad/Closed (or absent) are not surfaced.

const MONTH_NAMES = [
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
// The model extracts structured intent into FilterArgs (via the filter_trips
// tool); this runs the actual filter + ordering against the catalog so the
// result set is always complete and correctly ordered — never the model's
// recall. Timing (peak→shoulder) wins the sort; sortBy is the tiebreak.

type FilterArgs = {
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

function runFilter(args: FilterArgs, pool: CaddieTrip[]): CaddieTrip[] {
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
    // Length: keep a trip whose day range overlaps the requested window.
    if (args.minNights != null && t.durationMaxDays < args.minNights) return false;
    if (args.maxNights != null && t.durationMinDays > args.maxNights) return false;
    // Vibe is OR-matched: the model expands a mood into several synonym tags
    // (e.g. "boys trip" → Bachelor Party / Party Atmosphere / Buddy Trip
    // Classic), and a trip carrying ANY of them is a fair match. AND-matching
    // here would make synonym expansion return nothing.
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

// Built per-request so `vibe` can be constrained to the catalog's actual tags —
// the vibe filter matches exact labels, so the model must use real values.
function buildFilterTool(vibeOptions: string[]): OpenAI.ChatCompletionTool {
  const vibe = vibeOptions.length
    ? { type: "array" as const, items: { type: "string" as const, enum: vibeOptions }, description: "Trip vibe/mood tags. Map the user's mood, tone, or synonyms to the closest tag(s) — not just exact words. E.g. 'boys trip'/'bachelor weekend' → Bachelor Party and/or Party Atmosphere; 'underrated'/'sleeper'/'off the radar' → Hidden Gem; 'romantic getaway' → Couples Trip; 'foodie' → Foodie Destination. Use only values from this list." }
    : { type: "array" as const, items: { type: "string" as const }, description: "Trip vibe/mood tags." };

  return {
    type: "function",
    function: {
      name: "filter_trips",
      description:
        "Find and rank GTI golf trips by structured criteria. Call this for ANY request to find, recommend, narrow, or list trips — by month/season, region, budget, length, vibe, course rankings, a specific course or architect, course access, or walkability. The grid the user sees is populated from this tool's results, so always call it for recommendations rather than naming trips from memory. Omit any parameter that doesn't apply.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "array", items: { type: "string", enum: MONTH_NAMES }, description: "Full month names the trip should be in peak or shoulder season for (e.g. 'January'). Use for month-specific questions." },
          seasons: { type: "array", items: { type: "string", enum: ["spring", "summer", "fall", "winter"] }, description: "Seasons the trip should be playable in." },
          regions: { type: "array", items: { type: "string", enum: REGIONS.map((r) => r.label) }, description: "US regions." },
          states: { type: "array", items: { type: "string" }, description: "US state names, e.g. 'Oregon'." },
          minCostTier: { type: "integer", minimum: 1, maximum: 5, description: "Minimum budget tier (1 = cheapest, 5 = luxury). Set only when the user names a floor (e.g. 'premium')." },
          maxCostTier: { type: "integer", minimum: 1, maximum: 5, description: "Maximum budget tier. Set only when the user names a ceiling (e.g. 'budget'/'under $$$'). For 'cheapest', prefer sortBy 'cost_asc' over a hard cap." },
          minNights: { type: "integer", description: "Minimum trip length in days." },
          maxNights: { type: "integer", description: "Maximum trip length in days. For a 'weekend', use 3." },
          vibe,
          minTop100: { type: "integer", description: "Minimum number of GTI Top 100 courses the trip must include." },
          accessType: { type: "string", description: "Course access the user needs: 'public', 'resort', or 'private'. Set this whenever the user says public/resort/private." },
          walkable: { type: "boolean", description: "True when the user wants walkable courses." },
          courseOrArchitect: { type: "string", description: "A specific course name, architect, or course style to match. Always expand initials/abbreviations and nicknames to the architect's full name (e.g. 'DMK' → 'David McLay Kidd', 'Coore' → 'Bill Coore'). Examples: 'Bandon Dunes', 'Tom Doak', 'links'." },
          sortBy: { type: "string", enum: ["ranking", "rating", "top100", "value", "cost_asc", "cost_desc"], description: "Result order. Default 'ranking' (GTI site ranking). Use 'top100' for 'most/best Top 100 courses', 'cost_asc' for cheapest first, 'value' for best value." },
        },
      },
    },
  };
}

// ── Route handler ──────────────────────────────────────────────────────────

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message: string = String(body.message ?? "").trim();
    const history: { role: "user" | "assistant"; content: string }[] =
      Array.isArray(body.history) ? body.history : [];
    const filteredSlugs: string[] | null = Array.isArray(body.filteredSlugs)
      ? body.filteredSlugs
      : null;

    if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });

    const allTrips = await getCaddieData();

    // The pool the model recommends from: narrowed to the active UI filters if
    // any, otherwise the full catalog. Both the system-prompt catalog and the
    // deterministic filter operate on this same pool.
    const pool = filteredSlugs
      ? allTrips.filter((t) => filteredSlugs.includes(t.slug))
      : allTrips;

    const systemPrompt = buildSystemPrompt(pool);
    const recentHistory = history.slice(-10);
    const baseMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...recentHistory.map((m) => ({ role: m.role, content: m.content } as OpenAI.ChatCompletionMessageParam)),
      { role: "user", content: message },
    ];

    const openai = getOpenAI();
    const vibeOptions = [...new Set(pool.flatMap((t) => t.vibe ?? []))].sort();

    // First turn: the model either calls filter_trips (recommendation) or
    // answers directly (general golf question).
    // The full-catalog system prompt is ~47k tokens, well under gpt-4o-mini's
    // 128k window. Keep serializeTrip lean so this stays in budget as trips are
    // added — if it nears the cap, move to a larger-context model.
    const first = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      tools: [buildFilterTool(vibeOptions)],
      tool_choice: "auto",
      // One combined filter call, never parallel — runFilter merges all criteria
      // (e.g. multiple vibes) into a single query, and parallel calls would leave
      // tool_call_ids unanswered on the follow-up turn.
      parallel_tool_calls: false,
      messages: baseMessages,
    });

    const choice = first.choices[0]?.message;
    const toolCall = choice?.tool_calls?.find(
      (c) => c.type === "function" && c.function.name === "filter_trips"
    );

    // General Q&A — no recommendation, grid unchanged.
    if (!choice || !toolCall || toolCall.type !== "function") {
      return NextResponse.json({
        text: choice?.content ?? "I had trouble generating a response. Please try again.",
        slugs: null,
      });
    }

    // Recommendation: the model extracted intent; we filter + order
    // deterministically against the catalog so the result set is complete.
    let args: FilterArgs = {};
    try {
      args = JSON.parse(toolCall.function.arguments || "{}");
    } catch {
      /* malformed args → empty filter (whole pool, ranked) */
    }
    const results = runFilter(args, pool);
    const slugs = results.map((t) => t.slug);

    const toolResult = results.length
      ? results.map((t, i) => `${i + 1}. ${t.name} [slug: ${t.slug}]`).join("\n")
      : "No trips match those criteria.";

    // Second turn: feed the deterministic result back so the model writes prose
    // over exactly those trips, in that order. Reconstruct the assistant message
    // with only the tool call we answer, so the tool result pairs 1:1 (the API
    // 400s if any tool_call_id in the assistant message lacks a response).
    const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: choice.content ?? "",
      tool_calls: [toolCall],
    };
    const second = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [
        ...baseMessages,
        assistantMsg,
        { role: "tool", tool_call_id: toolCall.id, content: toolResult },
      ],
    });

    const text = second.choices[0]?.message?.content ?? "";
    return NextResponse.json({ text, slugs: slugs.length ? slugs : null });
  } catch (e: unknown) {
    console.error("[plan/caddie]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
