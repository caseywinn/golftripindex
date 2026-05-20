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
  if (t.top100Count) lines.push(`Top 100 courses: ${t.top100Count}`);
  if (t.leadTime) lines.push(`Lead time: ${t.leadTime}`);
  if (t.driving) lines.push(`Driving: ${t.driving}`);
  if (t.costNote) lines.push(`Cost notes: ${t.costNote}`);

  if (t.overview) lines.push(`Overview: ${t.overview}`);
  if (t.verdict) lines.push(`Verdict: ${t.verdict}`);
  if (t.lodging) lines.push(`Lodging: ${t.lodging}`);
  if (t.dining) lines.push(`Dining: ${t.dining}`);
  if (t.fitYes) lines.push(`Best for: ${t.fitYes}`);
  if (t.fitNo) lines.push(`Not for: ${t.fitNo}`);
  if (t.teeTimeRules) lines.push(`Tee time rules: ${t.teeTimeRules}`);
  if (t.commonMistakes) lines.push(`Common mistakes: ${t.commonMistakes}`);

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
      if (c.dataDump) parts.push(`— ${c.dataDump}`);
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
        if (tokens.some((tok) => new RegExp(`\\b${tok.toLowerCase()}\\b`).test(q))) {
          matchedSlugs.add(trip.slug);
        }
      }

      // Course style match: whole-word check against each style value
      if (c.courseStyle?.length) {
        for (const style of c.courseStyle) {
          if (style.length >= 4 && new RegExp(`\\b${style.toLowerCase()}\\b`).test(q)) {
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

    const recentHistory = history.slice(-10);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...recentHistory.map((m) => ({ role: m.role, content: m.content } as OpenAI.ChatCompletionMessageParam)),
      { role: "user", content: message },
    ];

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
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
