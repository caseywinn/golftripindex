// lib/compare/generateHeadToHead.ts
import OpenAI from "openai";

import {
  buildHeadToHeadPrompt,
  lintGolferOutput,
  buildRevisionPrompt,
} from "./golferVoice";

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

function normalizeWinnerLines(md: string): string {
  if (!md) return md;

  // Capture entire remainder of line after Winner:
  const WINNER_LINE_RE =
    /(?:\*\*)?\s*Winner\s*(?::|—|-)\s*(?:\*\*)?\s*([^\n\r]*?)(?:\s*\*\*)?(?=\r?\n|$)/gi;

  let out = md.replace(WINNER_LINE_RE, (_m, rawWho) => {
    let who = String(rawWho ?? "").trim();

    // Strip any stray markdown asterisks anywhere in the winner text
    who = who.replace(/\*/g, "").replace(/\s+/g, " ").trim();

    return `\n\n**Winner: ${who}**`;
  });

  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

const REQUIRED_SECTIONS = [
  "The Golf",
  "Lodging",
  "Food and Drinks",
  "Beyond Golf",
  "Logistics and Travel",
  "Value",
  "Vibe",
  "The Verdict",
] as const;

function normalizeHeadings(md: string, nameA: string, nameB: string): string {
  let out = (md ?? "").trim();

  // Ensure the main header exists and is exactly "## A vs B" as first non-empty line
  const expectedTop = `## ${nameA} vs ${nameB}`;
  const firstLine = out.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";

  if (firstLine.trim() !== expectedTop) {
    out = `${expectedTop}\n\n${out}`;
  }

  // Normalize plain section labels like "The Golf" -> "## The Golf"
  // Only convert when the line is exactly the section name (possibly with whitespace)
  for (const s of REQUIRED_SECTIONS) {
    const re = new RegExp(`^\\s*${escapeRegExp(s)}\\s*$`, "gim");
    out = out.replace(re, `## ${s}`);
  }

  return out.trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeArticleMarkdown(md: string, nameA: string, nameB: string) {
  let out = (md ?? "").trim();

  out = normalizeHeadings(out, nameA, nameB);
  out = normalizeWinnerLines(out);

  //const r = enforceTwoParagraphsPerSection(out);
  //out = r.md;

  return { md: out };
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
    `You are a scratch golfer and seasoned travel veteran who has played the Top 100. You organize two annual golf trips per year, one with 4 people, the other with 12-16. Write with the voice of a contributor to The Fried Egg or No Laying Up. Use a conversational, authoritative, and slightly irreverent tone.`,
    'You want to provide your expertise to help a group of buddies decide which golf trip is better.',
    `Voice: conversational, authoritative, slightly irreverent. Like a Fried Egg / No Laying Up contributor.`,
    `Write a polished long-form Head-to-Head: ${A} vs ${B}.`,
    ``,
    `Voice & POV:`,
    `- Write like a grizzled scratch golfer who has planned too many trips to romanticize them.`,
    `- Use golf slang naturally (pure, firm and fast, the walk, at the turn). No try-hard lists.`,
    `- If one trip wins a section, don’t soften it. Name a loser when it’s a loser.`,
    `- Do not speak first person.`,
    ``,
    `What to Focus On:`,
    `- Stay inside “The Loop”: what the round feels like as it unfolds.`,
    `- Architecture over scenery: routing, green complexes, bunkering, angles.`,
    `- Apply the Buddy Test: settling bets, hangs after 36, post-round vibe.`,
    `- When discussing the golf, focus on the courses, the architcture, the architect, the variety. Have the authority of a golf course reviewer. Then secondarily mix in experiential details.`,
    ``,
    `What to Avoid:`,
    `- No marketing language (hidden gem, world-class, bucket list).`,
    `- Strictly avoid: tapestry, testament, bespoke, quintessential, oasis, nestled, boasting, unparalleled.`,
    `- No corporate transitions (however, moreover, ultimately).`,
    `- Do not explain or summarize. State it. Move on.`,
    ``,
    `Paragraph Shape:`,
    `- Each paragraph: 50-75 words.`,
    `- Two beats per paragraph: an initial observation, then a later-round or pressure moment.`,
    `- Try to include one short sentence fragment per paragraph.`,
    `- No bullet lists inside sections.`,
    ``,
    `Hard rules (must follow exactly):`,
    `- Do NOT mention "GTI", "GolfTripIndex", "pack", "data", "dataset", "outline", or AI.`,
    `- Do NOT include numeric ratings or scores (no "10 vs 9", no "9.2").`,
    `- You MAY mention course years opened and general rankings if present.`,
    `- Start with a header exactly: ## ${A} vs ${B}`,
    `- After the header, write exactly two short intro paragraphs before "## The Golf".`,
    `- For each required section, after exactly two paragraphs, output EXACTLY this line as a new paragraph: **Winner: <Trip Name or Tie>**. That line must be the final line of the section and must appear exactly 8 times (once per required section).`,
    `- Forbidden words: "gravity", "aura", "energy", "tapestry", "testament", "bespoke", "quintessential", "oasis", "nestled", "boasting", "unparalleled", "hidden gem", "world-class", "bucket list", "fragment", "akin", "advent", "amidst", "overstated", "conversely", "entails", "entrenched", "essential", "foster", "foray", "furthermore", "glean", "hinder", "integral", "intricate", "moreover", "nuance", "nuanced", "pivotal", "plethora", "robust", "tapestry", "unparalleled", "vast"`,
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
    max_output_tokens: 4000,
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

  const normalized1 = normalizeArticleMarkdown(article_markdown, nameA, nameB);
  article_markdown = normalized1.md;

  if (!hasRequiredStructure(article_markdown)) {
    console.log("Markdown", article_markdown);
    throw new Error("Generated article missing required headings or **Winner:** lines.");
  }

  const teaser = buildTeaserDeterministic(pack, w);
  //const facts_sidebar = factsSidebarFromPack(pack);
  const facts_sidebar = [""];

  return { teaser, article_markdown, facts_sidebar, outline: null };
}
