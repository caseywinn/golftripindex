// app/api/tools/public_golf_details/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

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

/**
 * Conservative scope gate: this tool is ONLY for golf-course/trip detail topics.
 * (Your chat route already guards out-of-scope, but keep a second guard here.)
 */
function looksGolfDetailRelated(q: string) {
  const t = (q || "").toLowerCase();

  const golfNouns =
    /\bgolf\b/.test(t) ||
    /\bcourse\b/.test(t) ||
    /\btrack\b/.test(t) ||
    /\bproperty\b/.test(t) ||
    /\bclub\b/.test(t) ||
    /\bgolf\s*club\b/.test(t) ||
    /\bcountry\s*club\b/.test(t) ||
    /\btrip\b/.test(t) ||
    /\bgetaway\b/.test(t) ||
    /\bvacation\b/.test(t) ||
    /\bgolf\s*weekend\b/.test(t) ||
    /\bweekend\s*trip\b/.test(t) ||
    /\bbuddy\s*trip\b/.test(t) ||
    /\bguys\s*trip\b/.test(t) ||
    /\bboys\s*trip\b/.test(t) ||
    /\bretreat\b/.test(t);

  const detailTopics =
    /\bhole(s)?\b/.test(t) ||
    /\bpar\s*3s?\b/.test(t) ||
    /\bpar\s*4s?\b/.test(t) ||
    /\bpar\s*5s?\b/.test(t) ||
    /\brouting\b/.test(t) ||
    /\bfront\s*nine\b/.test(t) ||
    /\bback\s*nine\b/.test(t) ||
    /\bgreens?\b/.test(t) ||
    /\bgreen\s*speed\b/.test(t) ||
    /\bgreen\s*complex(es)?\b/.test(t) ||
    /\bfairways?\b/.test(t) ||
    /\bbunkering\b/.test(t) ||
    /\bbunkers?\b/.test(t) ||
    /\bconditions\b/.test(t) ||
    /\bcourse\s*conditions\b/.test(t) ||
    /\bslope\b/.test(t) ||
    /\bpace\b/.test(t) ||
    /\bpace\s*of\s*play\b/.test(t) ||
    /\bcaddies?\b/.test(t) ||
    /\bforecaddie\b/.test(t) ||
    /\barchitect\b/.test(t) ||
    /\bcourse\s*architect\b/.test(t) ||
    /\bwalkable\b/.test(t) ||
    /\bwalking[-\s]*only\b/.test(t) ||
    /\bcarts?\b/.test(t) ||
    /\bcontouring\b/.test(t) ||
    /\bfirm(ness)?\b/.test(t) ||
    /\b36\s+a\s+day\b/.test(t) ||
    /\btwo\s+rounds\b/.test(t) ||
    /\breplay\b/.test(t) ||
    /\breplay\s+rate\b/.test(t) ||
    /\bsignature\s+holes?\b/.test(t) ||
    /\bviews?\b/.test(t) ||
    /\bscenery\b/.test(t) ||
    /\bscenic\b/.test(t) ||
    /\bweather\b/.test(t) ||
    /\bwind\b/.test(t) ||
    /\brain\b/.test(t) ||
    /\bturf\b/.test(t) ||
    /\bturf\s*type\b/.test(t) ||
    /\bbest\s+month\b/.test(t) ||
    /\bbest\s+season\b/.test(t) ||
    /\bbest\s+time\s+of\s+year\b/.test(t) ||
    /\bdriving\s*range\b/.test(t) ||
    /\bpractice\s*area\b/.test(t) ||
    /\bpractice\s*facility\b/.test(t) ||
    /\bfood\b/.test(t) ||
    /\bdrink\b/.test(t) ||
    /\bbar\b/.test(t) ||
    /\blocker\s*room\b/.test(t) ||
    /\bclubhouse\b/.test(t);

  return (golfNouns || detailTopics) && (t.length >= 4);
}

/**
 * Extract a likely place/course/club name from natural language.
 * This does not need to be perfect; it’s only used to bias web search.
 */
function extractPlacePhrase(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";

  // Strong patterns first
  const m =
    s.match(/\bnear\s+([A-Za-z0-9'’.\- ]{3,80})/i) ||
    s.match(/\bat\s+([A-Za-z0-9'’.\- ]{3,80})/i) ||
    s.match(/\bin\s+([A-Za-z0-9'’.\- ]{3,80})/i) ||
    s.match(/\babout\s+([A-Za-z0-9'’.\- ]{3,80})/i);

  if (m?.[1]) return m[1].trim();

  // If the whole thing is short, use it
  if (s.length <= 60) return s;

  // Otherwise use last meaningful words
  const words = s
    .replace(/[^\w\s'’.\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return words.slice(-5).join(" ");
}

/**
 * Use a text-proxy fetch via r.jina.ai to:
 * 1) Get DDG HTML as readable text
 * 2) Fetch page content as readable text without doing brittle HTML parsing
 */
async function fetchTextViaJina(url: string, ms = 9000) {
  const proxied = `https://r.jina.ai/http${url.startsWith("https://") ? "s" : ""}://${url.replace(/^https?:\/\//, "")}`;
  const res = await withTimeout(fetch(proxied, { cache: "no-store" }), ms, "jina fetch");
  if (!res.ok) throw new Error(`jina proxy failed (${res.status})`);
  return await res.text();
}

function pickLikelyUrlsFromDdgText(ddgText: string, limit = 6) {
  // DDG (via jina) tends to include many URLs; we filter obvious junk.
  const urls = new Set<string>();
  const lines = ddgText.split("\n");

  for (const line of lines) {
    const m = line.match(/https?:\/\/[^\s)"]+/g);
    if (!m) continue;

    for (const u0 of m) {
      const u = u0.replace(/&amp;/g, "&").replace(/\\u002F/g, "/");
      const lower = u.toLowerCase();

      // Filter out DDG internal, trackers, and very noisy domains
      if (lower.includes("duckduckgo.com")) continue;
      if (lower.includes("google.com")) continue;
      if (lower.includes("facebook.com")) continue;
      if (lower.includes("instagram.com")) continue;
      if (lower.includes("twitter.com")) continue;
      if (lower.includes("x.com")) continue;
      if (lower.includes("tiktok.com")) continue;

      // Keep likely content sources
      urls.add(u);
      if (urls.size >= limit) break;
    }
    if (urls.size >= limit) break;
  }

  return Array.from(urls);
}

function truncate(s: string, max: number) {
  const t = String(s || "");
  return t.length <= max ? t : t.slice(0, max);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const queryRaw = body?.query;

    if (!queryRaw || typeof queryRaw !== "string") {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const query = queryRaw.trim();
    if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

    if (!looksGolfDetailRelated(query)) {
      return NextResponse.json(
        {
          error:
            "Out of scope for public_golf_details. This tool only supports golf-course/trip detail topics (routing, holes, architect, conditions, etc).",
        },
        { status: 400 }
      );
    }

    const place = extractPlacePhrase(query);
    const needle = place || query;

    // 1) Web search (DuckDuckGo via jina text proxy)
    const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(`${needle} golf course architect routing greens bunkers conditions`)}`;
    const ddgText = await fetchTextViaJina(ddgUrl, 10000);

    const urls = pickLikelyUrlsFromDdgText(ddgText, 6);

    // 2) Fetch a few source texts
    const sourceDocs: Array<{ url: string; text: string }> = [];
    for (const u of urls.slice(0, 5)) {
      try {
        const txt = await fetchTextViaJina(u, 9000);
        // Keep only first ~12k chars to control token usage
        sourceDocs.push({ url: u, text: truncate(txt, 12000) });
      } catch {
        // Skip failures
      }
    }

    // 3) Summarize to structured JSON with OpenAI (no claims about “browsing”)
    const openai = getOpenAIClient();

    const system = [
      "You are a golf research assistant. You will be given a user query and source texts from the public web.",
      "You MUST produce valid JSON only.",
      "Do not fabricate facts. If something is not supported by the sources, set it to null and add a note in unknowns.",
      "Prefer authoritative sources (official course sites, established golf publications, Wikipedia) when conflicts exist.",
      "Keep the output concise and practical for trip planning and course discussion.",
      "",
      "JSON schema:",
      `{
  "query": string,
  "place": string | null,
  "facts": {
    "architect": string | null,
    "designers": string[] | null,
    "opened": string | null,
    "holes": number | null,
    "par": number | null,
    "routing_notes": string | null,
    "greens_notes": string | null,
    "bunkering_notes": string | null,
    "conditions_notes": string | null,
    "walkability": string | null,
    "caddies": string | null,
    "pace_notes": string | null,
    "practice_facilities": string | null,
    "clubhouse_food_drink": string | null,
    "best_time_of_year": string | null
  },
  "highlights": string[],
  "unknowns": string[],
  "sources": Array<{ "url": string, "why_used": string }>
}`,
    ].join("\n");

    const input = [
      `QUERY:\n${query}`,
      `PLACE_GUESS:\n${place || ""}`,
      `SOURCES_COUNT:\n${sourceDocs.length}`,
      "",
      ...sourceDocs.map(
        (d, i) => `SOURCE_${i + 1}_URL:\n${d.url}\nSOURCE_${i + 1}_TEXT:\n${d.text}\n`
      ),
      "Return JSON only.",
    ].join("\n");

    const resp = await withTimeout(
      openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: input },
        ],
      }),
      15000,
      "openai summarize"
    );

    const raw = stripJsonFences((resp as any)?.output_text || "");
    let parsed: any;

    try {
      parsed = JSON.parse(raw);
    } catch {
      // Hard fallback: return minimal diagnostic so your chat route can still proceed.
      return NextResponse.json(
        {
          query,
          place: place || null,
          facts: {},
          highlights: [],
          unknowns: ["Failed to parse summarizer output as JSON."],
          sources: sourceDocs.map((d) => ({ url: d.url, why_used: "fetched" })),
          _raw: truncate(raw, 2000),
        },
        { status: 200 }
      );
    }

    // Ensure sources always exist
    if (!Array.isArray(parsed.sources)) parsed.sources = [];
    if (!Array.isArray(parsed.highlights)) parsed.highlights = [];
    if (!Array.isArray(parsed.unknowns)) parsed.unknowns = [];

    // If we had zero fetched sources, tell the caller explicitly
    if (sourceDocs.length === 0) {
      parsed.unknowns = parsed.unknowns || [];
      parsed.unknowns.push("No public source pages were fetched successfully.");
      parsed.sources = parsed.sources || [];
    }

    return NextResponse.json(
      {
        ...parsed,
        _meta: {
          fetched_urls: urls,
          fetched_sources: sourceDocs.map((d) => d.url),
          openai_response_id: (resp as any)?.id ?? null,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("POST /api/tools/public_golf_details failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
