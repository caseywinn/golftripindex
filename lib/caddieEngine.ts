// /lib/caddieEngine.ts
import OpenAI from "openai";
import type { GTISearchHit } from "@/lib/types";
import { gtiSearch, gtiResolveAnchor, getTripDetailBySlug, getTop100ForTripSlug, getTripWithMostTopNCourses } from "@/lib/gti";

export type ChatRoleMsg = { role: "user" | "assistant"; content: string };

type Option = { id: string; label: string; value?: string };

export type AssistantPayload =
  | {
      kind: "question";
      step?: string;
      text?: string;
      allowFreeText?: boolean;
      options?: Option[];
    }
  | {
      kind: "info";
      step?: string;
      text?: string;
    }
  | {
      kind: string;
      step?: string;
      [k: string]: any;
    };

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function stripJsonFences(s: string) {
  return String(s || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function clamp<T>(arr: T[], max: number) {
  return arr.length <= max ? arr : arr.slice(arr.length - max);
}

function looksIncompleteText(t: string) {
  const s = (t || "").trim();
  if (!s) return true;
  if (s.endsWith(":")) return true;
  if (s.endsWith("…")) return true;
  if (s.length < 80) return true;
  return false;
}

function renderListFromPayload(payload: any) {
  const shortlist = Array.isArray(payload?.shortlist) ? payload.shortlist : [];
  if (!shortlist.length) return "";

  const lines: string[] = [];
  lines.push("Recommendations:");
  for (const item of shortlist) {
    const name = item?.tripName || item?.tripSlug || "Option";
    const why = Array.isArray(item?.whyItFits) ? item.whyItFits : [];
    const tradeoffs = Array.isArray(item?.tradeoffs) ? item.tradeoffs : [];
    lines.push(`- ${name}`);
    if (why.length) lines.push(`  - Why: ${why.join("; ")}`);
    if (tradeoffs.length) lines.push(`  - Tradeoffs: ${tradeoffs.join("; ")}`);
  }
  return lines.join("\n");
}

function parseTopN(text: string): number | null {
  const t = String(text || "").toLowerCase();

  // numeric forms: "top 25", "top-25", "top25"
  const m = t.match(/top\s*[- ]?\s*(\d{1,3})/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // "top ten", "top twenty five", minimal set you asked for
  if (t.includes("top ten")) return 10;
  if (t.includes("top twenty five") || t.includes("top twenty-five")) return 25;
  if (t.includes("top one hundred") || t.includes("top hundred")) return 100;

  // fallback: if it explicitly says "top 100" etc elsewhere
  if (/\b100\b/.test(t) && t.includes("top")) return 100;

  return null;
}

function parseStateFilter(text: string): string | null {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return null;

  // Full US state names (normalized to Title Case for output)
  const states: Array<{ abbr: string; name: string }> = [
    { abbr: "AL", name: "Alabama" },
    { abbr: "AK", name: "Alaska" },
    { abbr: "AZ", name: "Arizona" },
    { abbr: "AR", name: "Arkansas" },
    { abbr: "CA", name: "California" },
    { abbr: "CO", name: "Colorado" },
    { abbr: "CT", name: "Connecticut" },
    { abbr: "DE", name: "Delaware" },
    { abbr: "FL", name: "Florida" },
    { abbr: "GA", name: "Georgia" },
    { abbr: "HI", name: "Hawaii" },
    { abbr: "ID", name: "Idaho" },
    { abbr: "IL", name: "Illinois" },
    { abbr: "IN", name: "Indiana" },
    { abbr: "IA", name: "Iowa" },
    { abbr: "KS", name: "Kansas" },
    { abbr: "KY", name: "Kentucky" },
    { abbr: "LA", name: "Louisiana" },
    { abbr: "ME", name: "Maine" },
    { abbr: "MD", name: "Maryland" },
    { abbr: "MA", name: "Massachusetts" },
    { abbr: "MI", name: "Michigan" },
    { abbr: "MN", name: "Minnesota" },
    { abbr: "MS", name: "Mississippi" },
    { abbr: "MO", name: "Missouri" },
    { abbr: "MT", name: "Montana" },
    { abbr: "NE", name: "Nebraska" },
    { abbr: "NV", name: "Nevada" },
    { abbr: "NH", name: "New Hampshire" },
    { abbr: "NJ", name: "New Jersey" },
    { abbr: "NM", name: "New Mexico" },
    { abbr: "NY", name: "New York" },
    { abbr: "NC", name: "North Carolina" },
    { abbr: "ND", name: "North Dakota" },
    { abbr: "OH", name: "Ohio" },
    { abbr: "OK", name: "Oklahoma" },
    { abbr: "OR", name: "Oregon" },
    { abbr: "PA", name: "Pennsylvania" },
    { abbr: "RI", name: "Rhode Island" },
    { abbr: "SC", name: "South Carolina" },
    { abbr: "SD", name: "South Dakota" },
    { abbr: "TN", name: "Tennessee" },
    { abbr: "TX", name: "Texas" },
    { abbr: "UT", name: "Utah" },
    { abbr: "VT", name: "Vermont" },
    { abbr: "VA", name: "Virginia" },
    { abbr: "WA", name: "Washington" },
    { abbr: "WV", name: "West Virginia" },
    { abbr: "WI", name: "Wisconsin" },
    { abbr: "WY", name: "Wyoming" },
  ];

  // Prefer explicit "in <state>" / "within <state>" phrases
  for (const s of states) {
    const n = s.name.toLowerCase();
    if (t.includes(`in ${n}`) || t.includes(`within ${n}`) || t.includes(`from ${n}`)) {
      return s.name; // return full state name
    }
  }

  // Support abbreviations like "in CA" / "within TX"
  for (const s of states) {
    const ab = s.abbr.toLowerCase();
    const re = new RegExp(`\\b(in|within|from)\\s+${ab}\\b`, "i");
    if (re.test(t)) return s.name; // return full state name
  }

  // Also support just mentioning the state name anywhere (last resort)
  for (const s of states) {
    const n = s.name.toLowerCase();
    const re = new RegExp(`\\b${n.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(t)) return s.name;
  }

  return null;
}

function isMostTopNCoursesQuestion(text: string) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return false;

  const hasMost = t.includes("most") || t.includes("highest") || t.includes("max");
  if (!hasMost) return false;

  const hasTop = t.includes("top") || t.includes("rank") || t.includes("ranking") || t.includes("ranked");
  if (!hasTop) return false;

  const n = parseTopN(t);
  if (!n) return false;

  const hasTripConcept = t.includes("trip") || t.includes("destination") || t.includes("resort") || t.includes("property");
  return hasTripConcept;
}

/**
 * Ranking intent detection: keep it simple and deterministic.
 * We only compute "Top 100" from Airtable GolfCourses["Consolidated Ranking"].
 */
function isTop100RankingQuestion(text: string) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return false;

  // Must contain "100" AND a ranking intent word
  const has100 = /\b100\b/.test(t) || t.includes("top100") || t.includes("top-100");
  if (!has100) return false;

  // Ranking intent signals (avoid false positives like "100 degrees" or "100 miles")
  const intent =
    t.includes("top") ||
    t.includes("rank") ||
    t.includes("ranking") ||
    t.includes("ranked") ||
    t.includes("consolidated ranking") ||
    t.includes("golf digest") ||
    t.includes("golfweek") ||
    t.includes("top-100") ||
    t.includes("top100");

  if (!intent) return false;

  // Strong explicit forms
  if (
    t.includes("top 100") ||
    t.includes("top-100") ||
    t.includes("top100") ||
    t.includes("top one hundred") ||
    t.includes("how many top 100") ||
    t.includes("how many top-100") ||
    t.includes("how many top100") ||
    t.includes("how many are top 100") ||
    t.includes("how many are in the top 100") ||
    t.includes("how many top 100 courses")
  ) {
    return true;
  }

  // General pattern: mentions "top" + "100" + "course(s)" or "ranked"
  if (/\btop\b/.test(t) && /\b100\b/.test(t) && /\bcourse|courses|ranked|ranking|rank\b/.test(t)) {
    return true;
  }

  // Otherwise, do not treat it as a Top 100 ranking question.
  return false;
}

function pickTripSlugFromHits(hits: GTISearchHit[] | undefined | null): string | null {
  const arr = Array.isArray(hits) ? hits : [];
  for (const h of arr) {
    const kind = String((h as any)?.kind || "").toLowerCase();
    const slug = (h as any)?.tripSlug || (h as any)?.trip?.slug || (h as any)?.slug || null;

    if (!slug) continue;
    if (kind === "trip") return String(slug);
    if (String((h as any)?.tripName || "").trim()) return String(slug);
  }
  return null;
}

function formatTop100Answer(args: {
  tripName: string;
  top100Courses: Array<{ name: string; consolidatedRanking: number }>;
  excludedNoRankingCount: number;
}) {
  const { tripName, top100Courses, excludedNoRankingCount } = args;

  const sorted = (top100Courses || [])
    .filter(
      (c) =>
        c &&
        typeof c.name === "string" &&
        c.name.trim() &&
        typeof c.consolidatedRanking === "number" &&
        Number.isFinite(c.consolidatedRanking)
    )
    .slice()
    .sort((a, b) => a.consolidatedRanking - b.consolidatedRanking);

  const count = sorted.length;

  const lines = sorted.map((c) => `- ${c.name} (#${c.consolidatedRanking})`);

  const note =
    excludedNoRankingCount > 0
      ? `\n\nNote: ${excludedNoRankingCount} course(s) at this trip have no Consolidated Ranking in GTI and were excluded from the count.`
      : "";

  if (count === 0) {
    return `GTI doesn’t currently show any Top 100 courses for ${tripName} (per Consolidated Ranking ≤ 100).${note}`;
  }

  return `There ${count === 1 ? "is" : "are"} ${count} Top 100 course${
    count === 1 ? "" : "s"
  } at ${tripName} (per GTI Consolidated Ranking ≤ 100).\n\n${lines.join("\n")}${note}`;
}

export type CaddieTurnOutput = {
  assistantContent: string;
  assistantPayload: AssistantPayload;
  state_patch: any;
  // debug/meta
  gtiResultsCount: number;
  anchor: any;
  tripDetailUsed: boolean;
};

export async function runCaddieTurnShared(args: {
  content: string;

  // room provides this; widget can pass a lightweight default
  currentState: any;

  // history in room is DB-based; widget is local messages
  history: Array<{ kind: string; content: string }> | ChatRoleMsg[];

  // optional tool results (room may pass; widget can omit)
  publicInfo?: any;
  publicGolfDetails?: any;
  publicWeb?: any;

  // if you want to skip calling tools inside this engine (room already computed)
  gtiResults?: GTISearchHit[];
  anchor?: any;
  tripDetail?: any;

  // if you want to force an existing active trip context
  effectiveTripSlug?: string | null;
}) {
  const content = String(args.content || "").trim();
  if (!content) throw new Error("Missing content");

  // ---- 1) Grounding (shared) ----
  const gtiResults =
    args.gtiResults ??
    ((await gtiSearch(content).catch(() => [])) as GTISearchHit[]);

  const anchor =
    args.anchor ??
    (await gtiResolveAnchor(content).catch(() => ({ kind: "none" })));

  // Prefer explicit override, else anchor trip, else current state, else first trip hit
  const anchoredTripSlug =
    anchor?.kind === "trip" && anchor?.trip?.slug ? String(anchor.trip.slug) : null;

  const tripSlugFromHits = pickTripSlugFromHits(gtiResults);

  const effectiveTripSlug =
    args.effectiveTripSlug ??
    anchoredTripSlug ??
    args.currentState?.activeTripSlug ??
    tripSlugFromHits ??
    null;

  const tripDetail =
    args.tripDetail ??
    (effectiveTripSlug
      ? await getTripDetailBySlug(effectiveTripSlug).catch(() => null)
      : null);

    // ---- Deterministic: "Which trip has the most top N courses?" (NO LLM) ----
  if (isMostTopNCoursesQuestion(content)) {
    const topN = parseTopN(content) ?? 100;
    const courseState = parseStateFilter(content) ?? undefined;

    const result = await getTripWithMostTopNCourses({
      topN,
      courseState,
      leaderboardLimit: 5,
    }).catch(() => null);

    if (!result) {
      const assistantContent = "I couldn’t compute trip ranking counts right now. Try again in a moment.";
      return {
        assistantContent,
        assistantPayload: { kind: "info", step: "ranking_most_topn" },
        state_patch: {},
        gtiResultsCount: Array.isArray(gtiResults) ? gtiResults.length : 0,
        anchor,
        tripDetailUsed: !!tripDetail,
      } satisfies CaddieTurnOutput;
    }

    const scope = result.courseState ? ` in ${result.courseState}` : "";
    const winners = result.winners || [];
    const leaderboard = result.leaderboard || [];

    const winnerLine =
      winners.length === 1
        ? `${winners[0].tripName} has the most Top ${result.topN} courses${scope} (${winners[0].count}).`
        : `Tie: ${winners.map((w) => w.tripName).join(", ")} each have ${winners[0]?.count ?? 0} Top ${result.topN} courses${scope}.`;

    const lines = leaderboard.map((x, i) => `${i + 1}. ${x.tripName} — ${x.count}`);

    const assistantContent = `${winnerLine}\n\nTop trips by Top ${result.topN} course count${scope}:\n${lines.join("\n")}`;

    const assistantPayload: AssistantPayload = {
      kind: "info",
      step: "ranking_most_topn",
      topN: result.topN,
      courseState: result.courseState ?? null,
      winners: winners.map((w) => ({
        tripSlug: w.tripSlug,
        tripName: w.tripName,
        count: w.count,
      })),
      leaderboard: leaderboard.map((x) => ({
        tripSlug: x.tripSlug,
        tripName: x.tripName,
        count: x.count,
      })),
      totalTripsConsidered: result.totalTripsConsidered,
    };

    return {
      assistantContent,
      assistantPayload,
      state_patch: {},
      gtiResultsCount: Array.isArray(gtiResults) ? gtiResults.length : 0,
      anchor,
      tripDetailUsed: !!tripDetail,
    } satisfies CaddieTurnOutput;
  }

  // ---- 1.5) Deterministic handling for Top 100 questions (NO LLM) ----
  // IMPORTANT: your TripDetail shape is { trip: {...}, courses: { must_play: GolfCourse[], ... } }
  if (isTop100RankingQuestion(content)) {
    if (!effectiveTripSlug) {
      const assistantContent =
        "I can answer this using GTI course rankings, but I’m not sure which trip you mean. Which destination/trip are you asking about (e.g., “Sand Valley”)?";
      return {
        assistantContent,
        assistantPayload: { kind: "info", step: "ranking_top100" },
        state_patch: {},
        gtiResultsCount: Array.isArray(gtiResults) ? gtiResults.length : 0,
        anchor,
        tripDetailUsed: !!tripDetail,
      } satisfies CaddieTurnOutput;
    }

    if (!tripDetail) {
      const assistantContent =
        `I couldn’t load GTI trip details for "${effectiveTripSlug}" right now, so I can’t compute Top 100 counts. Try again, or ask about a different trip.`;
      return {
        assistantContent,
        assistantPayload: { kind: "info", step: "ranking_top100" },
        state_patch: {},
        gtiResultsCount: Array.isArray(gtiResults) ? gtiResults.length : 0,
        anchor,
        tripDetailUsed: false,
      } satisfies CaddieTurnOutput;
    }

    const tripName = String((tripDetail as any)?.trip?.name || effectiveTripSlug);
    const buckets = (tripDetail as any)?.courses || {};

    const allCourseObjs = [
      ...(Array.isArray(buckets.must_play) ? buckets.must_play : []),
      ...(Array.isArray(buckets.should_play) ? buckets.should_play : []),
      ...(Array.isArray(buckets.want_more) ? buckets.want_more : []),
      ...(Array.isArray(buckets.unknown) ? buckets.unknown : []),
    ];

    function coerceRank(v: any): number | null {
      if (typeof v === "number" && Number.isFinite(v)) return v;

      const s = String(v ?? "").trim();
      if (!s) return null;

      // Extract first integer like 12 from "#12", "T12", "12 (GD)", "12.0"
      const m = s.match(/(\d{1,3})/);
      if (!m) return null;

      const n = Number(m[1]);
      return Number.isFinite(n) ? n : null;
    }

    const ranked = allCourseObjs
      .map((c: any) => {
        const r = coerceRank(c?.consolidatedRanking);
        return r == null
          ? null
          : { name: String(c?.name || "").trim(), consolidatedRanking: r, slug: c?.slug };
      })
      .filter((x: any) => x && x.name) as Array<{ name: string; consolidatedRanking: number; slug?: string }>;

    const excludedNoRankingCount = allCourseObjs.length - ranked.length;

    const top100Courses = ranked
      .filter((c) => c.consolidatedRanking <= 100)
      .map((c) => ({ name: c.name, consolidatedRanking: c.consolidatedRanking, slug: c.slug }));


    const assistantContent = formatTop100Answer({
      tripName,
      top100Courses: top100Courses.map((c) => ({
        name: c.name,
        consolidatedRanking: c.consolidatedRanking,
      })),
      excludedNoRankingCount,
    });

    const assistantPayload: AssistantPayload = {
      kind: "info",
      step: "ranking_top100",
      tripSlug: effectiveTripSlug,
      tripName,
      top100Count: top100Courses.length,
      top100Courses: top100Courses
        .slice()
        .sort((a, b) => a.consolidatedRanking - b.consolidatedRanking)
        .map((c) => ({
          name: c.name,
          consolidatedRanking: c.consolidatedRanking,
          ...(c.slug ? { slug: c.slug } : {}),
        })),
      excludedNoRankingCount,
    };

    const state_patch =
      args.currentState?.activeTripSlug === effectiveTripSlug
        ? {}
        : {
            activeTripSlug: effectiveTripSlug,
            activeTripName: tripName,
          };

    return {
      assistantContent,
      assistantPayload,
      state_patch,
      gtiResultsCount: Array.isArray(gtiResults) ? gtiResults.length : 0,
      anchor,
      tripDetailUsed: true,
    } satisfies CaddieTurnOutput;
  }

  // ---- 2) Normalize history into your room’s HISTORY format ----
  const historyLines: string[] = [];
  const h = Array.isArray(args.history) ? args.history : [];
  const last = clamp(h as any[], 30);

  for (const m of last) {
    if ((m as any)?.kind) {
      historyLines.push(`${String((m as any).kind).toUpperCase()}: ${(m as any).content}`);
      continue;
    }
    if ((m as any)?.role) {
      const k = (m as any).role === "assistant" ? "ASSISTANT" : "USER";
      historyLines.push(`${k}: ${(m as any).content}`);
      continue;
    }
  }

  // ---- 3) Single shared prompt + input assembly (match room route) ----
  const system = [
    "You are GTI Caddie, the conversational assistant for GolfTripIndex.com.",
    "Scope: golf trips, trip details, courses within/near trips, vibe, food & lodging overview, high-level airports/drive estimates, golf course details, and booking timelines.",
    "Never act as a travel agent. Do not discuss specific flights/airlines, tee times, or booking transactions.",
    "",
    "Data sources:",
    "1) TRIP_DETAIL_JSON (authoritative when present for the active trip: courses.must_play/should_play/want_more, plus trip prose fields).",
    "2) GTI_RESULTS_JSON (search hits from Airtable). Use to discover trips/courses and to anchor context.",
    "3) PUBLIC_INFO_JSON is allowed only when Airtable is insufficient.",
    "4) PUBLIC_GOLF_DETAILS_JSON is allowed only when Airtable is insufficient.",
    "5) Never claim you searched the internet or used online sources.",
    "",
    "Behavior rules:",
    "- If TRIP_DETAIL_JSON exists and the user asks about nearby courses or other courses in the area, answer using courses.want_more first, then trip.wantMore prose.",
    "- If the user asks about courses included in a trip, use courses.must_play and courses.should_play, then trip.dataDump prose.",
    "- If the user asks about food/lodging, use trip.foodAndLodgingOverview first, then trip.dataDump prose.",
    "- Keep the conversation context: if activeTripSlug is set, assume the user is still on that trip unless they switch.",
    "- If the user asks about holes/routing/architect/conditions/etc, use Airtable first. If Airtable is missing those details, you may use PUBLIC_GOLF_DETAILS_JSON or PUBLIC_INFO_JSON.",
    "- If the user asks about a trip/location that is not in Airtable and there is no active trip, ask a clarifying question instead of guessing.",
    "- Never mention GTI or Airtable.",
    "- Never discuss history, politics, war, nudity, sex, or violence.",
    "",
    "Ranking rule (CRITICAL):",
    "- If asked about rankings (e.g., “Top 100”), use ONLY the course field Consolidated Ranking from the provided GTI data. Do NOT use general knowledge or external lists.",
    "- If Consolidated Ranking is missing, say you don’t have it in GTI data.",
    "",
    "Output MUST be valid JSON only with keys:",
    `{"assistantContent":"...","assistantPayload":{...},"state_patch":{...}}`,
    "",
    "assistantPayload is optional UI metadata. Use {\"kind\":\"info\"} if no buttons.",
    "state_patch should ONLY include fields you are confident about (e.g., activeTripSlug/activeTripName/activeState, daysOfGolf, budgetTier).",
    "Do not invent trips/courses that are not present in Airtable.",
    "",
    "CRITICAL:",
    "- assistantContent MUST be a complete, standalone answer with all details included.",
    "- Do NOT put key information only in assistantPayload. Payload should only duplicate/structure what is already in assistantContent.",
  ].join("\n");

  const input = [
    `SYSTEM:\n${system}`,
    `CURRENT_STATE_JSON:\n${JSON.stringify(args.currentState ?? {})}`,
    `ANCHOR_JSON:\n${JSON.stringify(anchor ?? null)}`,
    `TRIP_DETAIL_JSON:\n${JSON.stringify(tripDetail ?? null)}`,
    `GTI_RESULTS_JSON:\n${JSON.stringify(gtiResults ?? [])}`,
    `PUBLIC_INFO_JSON:\n${JSON.stringify(args.publicInfo ?? null)}`,
    `PUBLIC_GOLF_DETAILS_JSON:\n${JSON.stringify(args.publicGolfDetails ?? null)}`,
    `PUBLIC_WEB_JSON:\n${JSON.stringify(args.publicWeb ?? null)}`,
    "HISTORY:",
    ...historyLines,
    "",
    "Return JSON only:",
    `{"assistantContent":"...","assistantPayload":{"kind":"info"},"state_patch":{}}`,
    "",
    `USER_NOW: ${content}`,
  ].join("\n");

  // ---- 4) OpenAI call (same API as room) ----
  const openai = getOpenAIClient();

  const resp = await openai.responses.create({
    model: "gpt-4o-mini",
    input,
  });

  const raw = stripJsonFences((resp as any)?.output_text?.trim() || "");
  let assistantContent = "";
  let assistantPayload: AssistantPayload = { kind: "info" };
  let state_patch: any = {};

  try {
    const parsed = JSON.parse(raw);
    assistantContent = String(parsed?.assistantContent || "").trim();
    if (parsed?.assistantPayload && typeof parsed.assistantPayload === "object") {
      assistantPayload = parsed.assistantPayload;
    }
    state_patch =
      parsed?.state_patch && typeof parsed.state_patch === "object" ? parsed.state_patch : {};
  } catch {
    assistantContent = raw || "I’m not sure I understood—can you rephrase that?";
    assistantPayload = { kind: "info" };
    state_patch = {};
  }

  if (!assistantContent) assistantContent = "I’m not sure I understood—can you rephrase that?";

  // ---- 5) “Cut off” protection (server-side stitch if needed) ----
  if ((assistantPayload as any)?.kind === "recommendations" && looksIncompleteText(assistantContent)) {
    const stitched = renderListFromPayload(assistantPayload);
    if (stitched) {
      const intro = assistantContent.trim();
      assistantContent = intro && !intro.endsWith(":") ? `${intro}\n\n${stitched}` : stitched;
    }
  }

  return {
    assistantContent,
    assistantPayload,
    state_patch,
    gtiResultsCount: Array.isArray(gtiResults) ? gtiResults.length : 0,
    anchor,
    tripDetailUsed: !!tripDetail,
  } satisfies CaddieTurnOutput;
}
