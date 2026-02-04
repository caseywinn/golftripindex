// lib/compare/generateHeadToHead.ts
import OpenAI from "openai";

// ---------- Types ----------
type Winner = "A" | "B" | "Tie";

type GenerateResult = {
  teaser: string;
  article_markdown: string;
  facts_sidebar: string[];
  outline: null; // kept for backward compatibility / debugging placeholder
};

// ---------- OpenAI client ----------
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- Guardrails ----------
const FORBIDDEN_PHRASES = ["the pack", "data pack", "pack ", "gti", "golftripindex", "dataset", "outline"];

function containsForbidden(md: string): boolean {
  const lower = (md ?? "").toLowerCase();
  if (FORBIDDEN_PHRASES.some((p) => lower.includes(p))) return true;

  // Disallow numeric "scores/ratings" mentions. We allow years and course rankings.
  // Block decimals anywhere (most common for "9.2") and rating-ish integer patterns when paired with rating language.
  const hasDecimal = /\b\d+\.\d+\b/.test(md);
  const hasRatingishIntegerWithLanguage =
    /\b(?:10|9|8|7|6|5|4|3|2|1)\b/.test(md) && /\b(rating|ratings|score|scores|rates|rated)\b/i.test(md);

  return hasDecimal || hasRatingishIntegerWithLanguage;
}

function hasRequiredStructure(md: string) {
  const requiredHeadings = [
    "## The Golf",
    "## Lodging",
    "## Food and Drinks",
    "## Beyond Golf",
    "## Logistics and Travel",
    "## Value",
    "## Vibe",
    "## The Verdict",
  ];
  const headingsOk = requiredHeadings.every((h) => md.includes(h));
  const winnerOk = /\*\*Winner:/.test(md);
  return headingsOk && winnerOk;
}

// ---------- Deterministic winners (no model call) ----------
function pickWinner(a: number | null | undefined, b: number | null | undefined): Winner {
  if (typeof a !== "number" || typeof b !== "number") return "Tie";
  if (Math.abs(a - b) < 0.1) return "Tie"; // tune threshold
  if (Math.abs(a - b) < 0.4) return a > b ? "A" : "B"; // tune threshold
  return a > b ? "A" : "B";
}

function sectionWinners(pack: any) {
  const A = pack?.tripA;
  const B = pack?.tripB;

  return {
    golf: pickWinner(A?.ratings?.golf, B?.ratings?.golf),
    lodging: pickWinner(A?.ratings?.lodging, B?.ratings?.lodging),
    food: pickWinner(A?.ratings?.food, B?.ratings?.food),
    beyond: pickWinner(A?.ratings?.beyond_golf, B?.ratings?.beyond_golf),
    logistics: pickWinner(A?.ratings?.logistics, B?.ratings?.logistics),
    value: pickWinner(A?.ratings?.value, B?.ratings?.value),
    vibe: pickWinner(A?.ratings?.vibe, B?.ratings?.vibe),
    verdict: pickWinner(A?.ratings?.overall, B?.ratings?.overall),
  } as const;
}

function winnerLabel(w: Winner, nameA: string, nameB: string) {
  if (w === "A") return nameA;
  if (w === "B") return nameB;
  return "Tie";
}

// ---------- Facts sidebar (same as before, but keep ratings out if you prefer) ----------
function pickTopCourses(trip: any, n: number): string[] {
  const courses = Array.isArray(trip?.courses) ? trip.courses : [];
  return courses
    .slice()
    .sort((a: any, b: any) => (a?.trip_course_rank ?? 999) - (b?.trip_course_rank ?? 999))
    .slice(0, n)
    .map((c: any) => c?.name)
    .filter(Boolean);
}

function fmtMonths(arr: any): string {
  const a = Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  return a.length ? a.join(", ") : "—";
}

function factsSidebarFromPack(pack: any): string[] {
  const A = pack.tripA;
  const B = pack.tripB;

  const aTop = pickTopCourses(A, 3);
  const bTop = pickTopCourses(B, 3);

  const facts: string[] = [];
  facts.push(`Trip A: ${A?.name}${A?.secondary_name ? ` (${A.secondary_name})` : ""}`);
  facts.push(`Trip B: ${B?.name}${B?.secondary_name ? ` (${B.secondary_name})` : ""}`);

  if (A?.duration_min_days || A?.duration_max_days) {
    facts.push(`A typical duration: ${A?.duration_min_days ?? "?"}–${A?.duration_max_days ?? "?"} days`);
  }
  if (B?.duration_min_days || B?.duration_max_days) {
    facts.push(`B typical duration: ${B?.duration_min_days ?? "?"}–${B?.duration_max_days ?? "?"} days`);
  }

  if (A?.stay_type) facts.push(`A stay type: ${A.stay_type}`);
  if (B?.stay_type) facts.push(`B stay type: ${B.stay_type}`);

  if (typeof A?.cost_tier === "number") facts.push(`A cost tier: ${A.cost_tier}`);
  if (typeof B?.cost_tier === "number") facts.push(`B cost tier: ${B.cost_tier}`);

  const aAir = Array.isArray(A?.nearest_airports) ? A.nearest_airports : [];
  const bAir = Array.isArray(B?.nearest_airports) ? B.nearest_airports : [];
  if (aAir.length) facts.push(`A nearest airports: ${aAir.join(", ")}`);
  if (bAir.length) facts.push(`B nearest airports: ${bAir.join(", ")}`);

  facts.push(`A peak months: ${fmtMonths(A?.peak_months)}`);
  facts.push(`B peak months: ${fmtMonths(B?.peak_months)}`);
  facts.push(`A shoulder months: ${fmtMonths(A?.shoulder_months)}`);
  facts.push(`B shoulder months: ${fmtMonths(B?.shoulder_months)}`);

  if (aTop.length) facts.push(`A top courses (by Trip Course Rank): ${aTop.join(", ")}`);
  if (bTop.length) facts.push(`B top courses (by Trip Course Rank): ${bTop.join(", ")}`);

  // NOTE: Keep overall ratings OUT to avoid tempting score mentions in UI.
  return facts;
}

// ---------- Pack minimization for article (big token win) ----------
function takeTopNCourses(trip: any, n: number) {
  const courses = Array.isArray(trip?.courses) ? trip.courses : [];
  return courses
    .slice()
    .sort((a: any, b: any) => (a?.trip_course_rank ?? 999) - (b?.trip_course_rank ?? 999))
    .slice(0, n)
    .map((c: any) => ({
      name: c?.name,
      trip_course_rank: c?.trip_course_rank,
      architect: c?.architect,
      year_opened: c?.year_opened,
      state: c?.state,
      course_type: c?.course_type,
      stay_play_required: c?.stay_play_required,
      rankings: c?.rankings,
    }));
}

function compactText(s: any, max: number) {
  const t = typeof s === "string" ? s.trim() : "";
  if (!t) return null;
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function redactAndMinimizePackForArticle(pack: any) {
  const safeTrip = (t: any) => ({
    name: t?.name,
    secondary_name: t?.secondary_name ?? null,
    subheader: t?.subheader ?? null,
    overview: compactText(t?.overview, 900),
    // Drop full_description entirely for speed; it bloats tokens and invites "ratings talk"
    food_and_lodging_overview: compactText(t?.food_and_lodging_overview, 500),
    travel_notes: compactText(t?.travel_notes, 500),
    vibe_summary: compactText(t?.vibe_summary, 500),
    duration_min_days: t?.duration_min_days ?? null,
    duration_max_days: t?.duration_max_days ?? null,
    stay_type: t?.stay_type ?? null,
    cost_tier: t?.cost_tier ?? null,
    lead_time: t?.lead_time ?? null,
    nearest_airports: Array.isArray(t?.nearest_airports) ? t.nearest_airports : [],
    peak_months: Array.isArray(t?.peak_months) ? t.peak_months : [],
    shoulder_months: Array.isArray(t?.shoulder_months) ? t.shoulder_months : [],
    courses_top5: takeTopNCourses(t, 3),
  });

  return {
    tripA: safeTrip(pack.tripA),
    tripB: safeTrip(pack.tripB),
  };
}

// ---------- Prompt ----------
function buildTeaserDeterministic(pack: any, winners: ReturnType<typeof sectionWinners>) {
  // No scores, no GTI, no "pack". One sentence.
  const A = pack.tripA?.name || "Trip A";
  const B = pack.tripB?.name || "Trip B";
  const v = winners.verdict === "Tie" ? "a close call" : `an edge for ${winnerLabel(winners.verdict, A, B)}`;
  const t = `${A} vs ${B} is a head-to-head between two very different trips, with ${v} once golf, logistics, and off-course fit are weighed.`;
  return t.length > 180 ? t.slice(0, 179).trimEnd() : t;
}

function articlePromptString(args: {
  tripAName: string;
  tripBName: string;
  winners: Record<string, string>;
  source: any;
}) {
  const { tripAName: A, tripBName: B, winners, source } = args;

  return [
    `You are an editorial golf writer.`,
    `Write a polished long-form Head-to-Head: ${A} vs ${B}.`,
    ``,
    `Hard rules (must follow exactly):`,
    `- Do NOT mention "GTI", "GolfTripIndex", "pack", "data", "dataset", "outline", or AI.`,
    `- Do NOT include numeric ratings or scores (no "10 vs 9", no "9.2").`,
    `- You MAY mention course years opened and general rankings if present.`,
    `- Start with a header exactly: ## ${A} vs ${B}`,
    `- After the header, write exactly two short intro paragraphs before "## The Golf".`,
    `- Under EACH required section heading, write exactly 2 paragraphs and then a standalone winner line formatted exactly: **Winner: <Trip Name or Tie>**`,
    `- The winner line must be on its own line, and contain NOTHING after it.`,
    ``,
    `Required sections in this exact order:`,
    `## The Golf`,
    `## Lodging`,
    `## Food and Drinks`,
    `## Beyond Golf`,
    `## Logistics and Travel`,
    `## Value`,
    `## Vibe`,
    `## The Verdict`,
    ``,
    `Section winners to enforce (do not quote as a list in the article, just honor them):`,
    `- The Golf: ${winners.golf}`,
    `- Lodging: ${winners.lodging}`,
    `- Food and Drinks: ${winners.food}`,
    `- Beyond Golf: ${winners.beyond}`,
    `- Logistics and Travel: ${winners.logistics}`,
    `- Value: ${winners.value}`,
    `- Vibe: ${winners.vibe}`,
    `- The Verdict: ${winners.verdict}`,
    ``,
    `Source material (only):`,
    JSON.stringify(source),
  ].join("\n");
}

// ---------- Core generator ----------
export async function generateHeadToHead(pack: any): Promise<GenerateResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const nameA = pack?.tripA?.name || "Trip A";
  const nameB = pack?.tripB?.name || "Trip B";

  // Deterministic winners (no model call)
  const w = sectionWinners(pack);
  const winners = {
    golf: winnerLabel(w.golf, nameA, nameB),
    lodging: winnerLabel(w.lodging, nameA, nameB),
    food: winnerLabel(w.food, nameA, nameB),
    beyond: winnerLabel(w.beyond, nameA, nameB),
    logistics: winnerLabel(w.logistics, nameA, nameB),
    value: winnerLabel(w.value, nameA, nameB),
    vibe: winnerLabel(w.vibe, nameA, nameB),
    verdict: winnerLabel(w.verdict, nameA, nameB),
  };

  // Smaller, safer input
  const source = redactAndMinimizePackForArticle(pack);

  // Single model call for article
  const resp = await client.responses.create({
    model: "gpt-5-nano",
    input: articlePromptString({
      tripAName: nameA,
      tripBName: nameB,
      winners,
      source,
    }),
    reasoning: { effort: "low" },
    max_output_tokens: 2500,
  });

  let article_markdown = (resp.output_text ?? "").trim();

  if (!article_markdown || article_markdown.length < 50) {
    throw new Error(`Empty article_markdown from model. Got length=${article_markdown?.length ?? 0}`);
  }
/**/

  if (containsForbidden(article_markdown)) {
    console.log("contains forbidden language");
    //throw new Error("Article contains forbidden GTI/pack references or numeric score language.");
  }
  if (!hasRequiredStructure(article_markdown)) {
    throw new Error("Generated article missing required headings or **Winner:** lines.");
  }

  const teaser = buildTeaserDeterministic(pack, w);
  //const facts_sidebar = factsSidebarFromPack(pack);
  const facts_sidebar = [""];

  return { teaser, article_markdown, facts_sidebar, outline: null };
}
