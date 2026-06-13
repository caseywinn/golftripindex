import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAllTripsWithCoursesForCaddie } from "@/lib/airtable";
import type { CaddieTrip } from "@/lib/airtable";

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
  ].filter(Boolean).join(", ");
  lines.push(`Ratings: ${ratings}`);

  if (t.seasons?.length) lines.push(`Best seasons: ${t.seasons.join(", ")}`);
  if (t.vibe?.length) lines.push(`Vibe: ${t.vibe.join(", ")}`);
  // Count Top 100 courses from the trip's actual courses + their GTI Consolidated
  // Ranking (≤100), not the trip-level rollup field — that is the source of truth.
  const top100Count = t.courses.filter(
    ({ course: c }) => typeof c.consolidatedRanking === "number" && c.consolidatedRanking <= 100
  ).length;
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
  const slugList = trips.map((t) => t.slug).join(", ");

  return `You are the GTI Caddie, an expert golf trip advisor for Golf Trip Index (GTI) — the definitive guide to America's best golf trips, ranked by courses, lodging, food, cost, and vibe.

You are a knowledgeable, opinionated golf friend. You speak with authority about golf courses, architects, design philosophy, course conditions, lodging, dining, nightlife, and logistics. You are direct, specific, and honest about trade-offs.

RESPONSE FORMAT:
Return valid JSON only: { "text": string, "slugs": string[] | null }

- "text": your response in markdown. When mentioning a specific GTI trip by name, format it as [Trip Name](trip:slug) so the user can click to learn more.
- "slugs": an array of trip slugs you are recommending, OR null if you are answering a general question without making trip-specific recommendations.

SLUG RULES:
- Only use slugs from this list: ${slugList}
- Always return trip slugs, never course slugs — courses belong to trips
- Return null when answering general golf questions: architecture history, designer biographies, "who designed X", course rankings not tied to a trip recommendation, etc.
- Return slugs when the user wants trip recommendations, even implicitly ("I love links golf", "we want walkable courses", "something like Bandon Dunes")
- Course and architect searches return parent trip slugs: if the user mentions a specific course or architect, return the trips that include that course or architect's work
- Order slugs by how well they match the request, best first

PERSONA RULES:
- Never mention "the database", "my data", "records", or any data source
- Never say you are an AI or reference your training
- If you don't know something specific, say so naturally

TRIP DATA (${trips.length} trips):
${tripBlocks}`;
}

// ── Course/architect/style criteria resolver ───────────────────────────────

// Escape regex metacharacters — course data can contain "(", ")", "+", etc.
// (e.g. a style of "Parkland (restored)"), which would otherwise throw when
// interpolated into a RegExp and break every Caddie request.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveByCourseCriteria(query: string, allTrips: CaddieTrip[]): string[] | null {
  const q = query.toLowerCase();
  const matchedSlugs = new Set<string>();

  for (const trip of allTrips) {
    for (const { course: c } of trip.courses) {
      // Architect match: split name into tokens, skip initials/short words, require whole word
      if (c.architect) {
        const tokens = c.architect
          .split(/[\s,./]+/)
          .filter((t) => t.length >= 4 && !/^[A-Z]\.$/.test(t));
        if (tokens.some((tok) => new RegExp(`\\b${escapeRegExp(tok.toLowerCase())}\\b`).test(q))) {
          matchedSlugs.add(trip.slug);
        }
      }

      // Course style match: whole-word check against each style value
      if (c.courseStyle?.length) {
        for (const style of c.courseStyle) {
          if (style.length >= 4 && new RegExp(`\\b${escapeRegExp(style.toLowerCase())}\\b`).test(q)) {
            matchedSlugs.add(trip.slug);
            break;
          }
        }
      }

      // Course name match: substring check, require name to be 8+ chars to avoid noise
      if (c.name && c.name.length >= 8 && q.includes(c.name.toLowerCase())) {
        matchedSlugs.add(trip.slug);
      }
    }
  }

  return matchedSlugs.size > 0 ? [...matchedSlugs] : null;
}

// ── Course-ranking resolver ─────────────────────────────────────────────────
// Questions about Top 100 / Top 10 / highest-ranked courses must be answered
// from each trip's actual courses and their GTI Consolidated Ranking — not from
// the LLM's reading of the prose. This computes the answer deterministically.

type RankedCourse = { name: string; rank: number };
type RankingTier = "top10" | "top100" | "best";
type RankedTrip = {
  trip: CaddieTrip;
  ranked: RankedCourse[];
  top100: RankedCourse[];
  top10: RankedCourse[];
  best: number; // best (lowest) consolidated ranking; Infinity if none
};

function tripRankedCourses(t: CaddieTrip): RankedCourse[] {
  return t.courses
    .map(({ course: c }) => ({ name: c.name, rank: c.consolidatedRanking }))
    .filter((c): c is RankedCourse => typeof c.rank === "number")
    .sort((a, b) => a.rank - b.rank);
}

function isRankingQuery(q: string): boolean {
  return /top[\s-]?100|top[\s-]?10\b|top[\s-]?ten|top[\s-]?hundred|highest[\s-]?ranked|best[\s-]?ranked|most[\s-]?ranked|ranked courses?|course rankings?|consolidated ranking|highest[\s-]?rated courses?|best (?:golf )?courses?/i.test(q);
}

function rankingTier(q: string): RankingTier {
  if (/top[\s-]?10\b|top[\s-]?ten/i.test(q)) return "top10";
  if (!/top[\s-]?100|top[\s-]?hundred/i.test(q) &&
      /highest[\s-]?ranked|best[\s-]?ranked|highest[\s-]?rated courses?|best (?:golf )?courses?/i.test(q)) {
    return "best";
  }
  return "top100";
}

function rankedTrips(pool: CaddieTrip[], tier: RankingTier): RankedTrip[] {
  const rows = pool
    .map((trip) => {
      const ranked = tripRankedCourses(trip);
      return {
        trip,
        ranked,
        top100: ranked.filter((c) => c.rank <= 100),
        top10: ranked.filter((c) => c.rank <= 10),
        best: ranked.length ? ranked[0].rank : Infinity,
      };
    })
    .filter((r) => r.ranked.length > 0);

  rows.sort((a, b) => {
    if (tier === "top10") return b.top10.length - a.top10.length || a.best - b.best;
    if (tier === "best") return a.best - b.best || b.top100.length - a.top100.length;
    return b.top100.length - a.top100.length || a.best - b.best;
  });
  return rows;
}

function buildRankingFacts(rows: RankedTrip[]): string {
  return rows
    .map((r) => {
      const courses = r.ranked.map((c) => `${c.name} #${c.rank}`).join(", ");
      return `- ${r.trip.name} [slug: ${r.trip.slug}] — Top 100: ${r.top100.length}, Top 10: ${r.top10.length} | courses by GTI Consolidated Ranking: ${courses}`;
    })
    .join("\n");
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

    // Pre-filter: if active filters, only include those trips in the prompt
    const contextTrips = filteredSlugs
      ? allTrips.filter((t) => filteredSlugs.includes(t.slug))
      : allTrips;

    const systemPrompt = buildSystemPrompt(contextTrips);

    // Course-ranking questions: compute the answer deterministically from each
    // trip's courses + their GTI Consolidated Ranking, and ground the model in it.
    const rankingPool = filteredSlugs ? allTrips.filter((t) => filteredSlugs.includes(t.slug)) : allTrips;
    const rankingRows = isRankingQuery(message) ? rankedTrips(rankingPool, rankingTier(message)) : [];
    const rankingSlugs = rankingRows.length > 0 ? rankingRows.map((r) => r.trip.slug) : null;

    const recentHistory = history.slice(-10);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...recentHistory.map((m) => ({ role: m.role, content: m.content } as OpenAI.ChatCompletionMessageParam)),
      ...(rankingRows.length > 0
        ? [{
            role: "system" as const,
            content:
              `VERIFIED COURSE-RANKING DATA — the user is asking about course rankings ` +
              `(Top 100 / Top 10 / highest ranked). Answer using ONLY the data below. It is ` +
              `computed directly from each trip's courses and their GTI Consolidated Ranking ` +
              `(lower number = better; Top 100 = ranking ≤ 100, Top 10 = ranking ≤ 10). The ` +
              `trips are already ordered best-first for this question — present them in this ` +
              `order, cite these exact counts and course rankings, and do not use any other ` +
              `numbers from the trip data above.\n\n${buildRankingFacts(rankingRows)}`,
          }]
        : []),
      { role: "user", content: message },
    ];

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      // The trimmed full-catalog system prompt is ~47k tokens, well under
      // gpt-4o-mini's 128k context window. Keep serializeTrip lean (it drops the
      // heavy editorial prose) so this stays comfortably within budget as trips
      // are added — if it ever approaches the cap, move to a larger-context model.
      model: "gpt-4o-mini",
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages,
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    let text = "I had trouble generating a response. Please try again.";
    let slugs: string[] | null = null;

    try {
      const parsed = JSON.parse(raw);
      text = String(parsed.text ?? "");
      slugs = Array.isArray(parsed.slugs) ? parsed.slugs : null;
    } catch {
      text = raw;
    }

    // Course-ranking result: authoritative override (already pool-narrowed and
    // ordered best-first). Takes precedence over course/architect criteria.
    if (rankingSlugs !== null) {
      slugs = rankingSlugs;
      return NextResponse.json({ text, slugs });
    }

    // Course/architect/style criteria: authoritative override of LLM slugs
    const criteriaSlugArray = resolveByCourseCriteria(message, allTrips);
    if (criteriaSlugArray !== null) {
      // Narrow to active filter pool if filters are applied
      const criteriaPool = filteredSlugs
        ? criteriaSlugArray.filter((s) => filteredSlugs.includes(s))
        : criteriaSlugArray;
      // Sort by trip ranking
      const rankMap = new Map(allTrips.map((t) => [t.slug, t.currentRanking ?? 9999]));
      criteriaPool.sort((a, b) => (rankMap.get(a) ?? 9999) - (rankMap.get(b) ?? 9999));
      slugs = criteriaPool.length > 0 ? criteriaPool : slugs;
    } else {
      // No course criteria: validate LLM slugs against full trip list
      if (slugs !== null) {
        const validSlugSet = new Set(allTrips.map((t) => t.slug));
        slugs = slugs.filter((s) => validSlugSet.has(s));
      }
    }

    return NextResponse.json({ text, slugs });
  } catch (e: any) {
    console.error("[plan/caddie]", e);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
