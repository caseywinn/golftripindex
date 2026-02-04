// lib/compare/generateHeadToHead.ts
import OpenAI from "openai";
import { z } from "zod";

// ---------- Types / Schemas ----------

const OutlineSectionSchema = z.object({
  key: z.enum(["golf", "lodging", "food", "logistics", "value", "vibe", "verdict"]),
  heading: z.string().min(1),
  tripA_points: z.array(z.string().min(1)).min(2).max(6),
  tripB_points: z.array(z.string().min(1)).min(2).max(6),
  winner: z.enum(["A", "B", "TIE"]),
  rationale: z.string().min(1),
});

const OutlineSchema = z.object({
  thesis: z.string().min(1),
  sections: z.array(OutlineSectionSchema).length(7),
  overall_verdict: z.object({
    winner: z.enum(["A", "B", "TIE"]),
    rationale: z.string().min(1),
    who_should_pick_A: z.array(z.string().min(1)).min(1).max(5),
    who_should_pick_B: z.array(z.string().min(1)).min(1).max(5),
  }),
});

const OUTLINE_JSON_SCHEMA = {
  name: "gti_head_to_head_outline",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["thesis", "sections", "overall_verdict"],
    properties: {
      thesis: { type: "string" },
      sections: {
        type: "array",
        minItems: 7,
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "heading", "tripA_points", "tripB_points", "winner", "rationale"],
          properties: {
            key: {
              type: "string",
              enum: ["golf", "lodging", "food", "logistics", "value", "vibe", "verdict"],
            },
            heading: { type: "string" },
            tripA_points: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
            tripB_points: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
            winner: { type: "string", enum: ["A", "B", "TIE"] },
            rationale: { type: "string" },
          },
        },
      },
      overall_verdict: {
        type: "object",
        additionalProperties: false,
        required: ["winner", "rationale", "who_should_pick_A", "who_should_pick_B"],
        properties: {
          winner: { type: "string", enum: ["A", "B", "TIE"] },
          rationale: { type: "string" },
          who_should_pick_A: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
          who_should_pick_B: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
        },
      },
    },
  },
} as const;

const TEASER_JSON_SCHEMA = {
  name: "gti_teaser",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["teaser"],
    properties: {
      teaser: { type: "string", maxLength: 180 },
    },
  },
} as const;

const TeaserSchema = z.object({
  teaser: z.string().min(1).max(180),
});

const FORBIDDEN_PHRASES = [
  "the pack",
  "data pack",
  "pack ",
  "gti",
  "golftripindex",
];

type Outline = z.infer<typeof OutlineSchema>;

type GenerateResult = {
  teaser: string;
  article_markdown: string;
  facts_sidebar: string[];
  outline: Outline; // keep for debugging; you can omit in API response later
};

// ---------- OpenAI client ----------
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- Helpers ----------
function pickTopCourses(trip: any, n: number): string[] {
  const courses = Array.isArray(trip?.courses) ? trip.courses : [];
  return courses
    .slice()
    .sort((a: any, b: any) => (a?.trip_course_rank ?? 999) - (b?.trip_course_rank ?? 999))
    .slice(0, n)
    .map((c: any) => c?.name)
    .filter(Boolean);
}

function clampTeaser(s: string, max = 180) {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;

  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 60 ? cut.slice(0, lastSpace) : cut;
  return base.trimEnd();
}

function teaserPrompt(pack: any, outline: Outline) {
  const A = pack.tripA?.name;
  const B = pack.tripB?.name;

  return [
    `Write ONE teaser sentence for a Head-to-Head golf trip comparison.`,
    ``,
    `Trips: ${A} vs ${B}`,
    ``,
    `Hard rules (must follow exactly):`,
    `- Maximum 180 characters total.`,
    `- Single sentence.`,
    `- No numeric ratings or scores.`,
    `- Do NOT mention GTI, GolfTripIndex, pack, data, dataset, or AI.`,
    `- Do not invent facts.`,
    ``,
    `Use this thesis as guidance (do not repeat verbatim):`,
    outline.thesis,
  ].join("\n");
}

function fmtMonths(arr: any): string {
  const a = Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  return a.length ? a.join(", ") : "—";
}

function containsForbidden(md: string): boolean {
  const lower = md.toLowerCase();
  if (FORBIDDEN_PHRASES.some((p) => lower.includes(p))) return true;

  // Block explicit numeric scores like 9.2, 10, 7.04, etc.
  // (This allows years like 1998 only if you want; see below.)
  const hasDecimalNumber = /\b\d+\.\d+\b/.test(md);
  const hasRatingishInteger =
    /\b(?:10|9|8|7|6|5|4|3|2|1)(?:\.\d+)?\b/.test(md) && /rating|score|rates?/i.test(md);

  return hasDecimalNumber || hasRatingishInteger;
}

/**
 * Create an "article-safe" version of the pack:
 * - Removes numeric ratings entirely
 * - Removes fields that invite "the pack says..."
 * - Keeps course list, architects, ranks, travel notes, vibe, etc.
 */
function redactPackForArticle(pack: any) {
  const stripRatings = (t: any) => {
    const { ratings, ...rest } = t || {};
    return rest;
  };

  const safeTrip = (trip: any) => {
    const t = stripRatings(trip);
    return {
      name: t.name,
      slug: t.slug,
      secondary_name: t.secondary_name,
      subheader: t.subheader,
      overview: t.overview,
      full_description: t.full_description,
      food_and_lodging_overview: t.food_and_lodging_overview,
      travel_notes: t.travel_notes,
      vibe_summary: t.vibe_summary,
      driving: t.driving,
      duration_min_days: t.duration_min_days,
      duration_max_days: t.duration_max_days,
      stay_type: t.stay_type,
      cost_tier: t.cost_tier,
      lead_time: t.lead_time,
      nearest_airports: t.nearest_airports,
      peak_months: t.peak_months,
      shoulder_months: t.shoulder_months,
      courses: (Array.isArray(t.courses) ? t.courses : []).map((c: any) => ({
        name: c.name,
        slug: c.slug,
        trip_course_rank: c.trip_course_rank,
        architect: c.architect,
        year_opened: c.year_opened,
        state: c.state,
        course_type: c.course_type,
        stay_play_required: c.stay_play_required,
        rankings: c.rankings, // rankings are fine; they’re not GTI scores
      })),
    };
  };

  return {
    generated_at: pack.generated_at,
    data_version: pack.data_version,
    tripA: safeTrip(pack.tripA),
    tripB: safeTrip(pack.tripB),
  };
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
    facts.push(
      `A typical duration: ${A?.duration_min_days ?? "?"}–${A?.duration_max_days ?? "?"} days`
    );
  }
  if (B?.duration_min_days || B?.duration_max_days) {
    facts.push(
      `B typical duration: ${B?.duration_min_days ?? "?"}–${B?.duration_max_days ?? "?"} days`
    );
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

  // Ratings (only if present)
  const aOverall = A?.ratings?.overall;
  const bOverall = B?.ratings?.overall;
  if (typeof aOverall === "number") facts.push(`A overall rating: ${aOverall}`);
  if (typeof bOverall === "number") facts.push(`B overall rating: ${bOverall}`);

  return facts;
}

function safeJsonParse(s: string): any {
  // Some models wrap JSON in ```; strip if needed
  const trimmed = s.trim();
  const noFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(noFence);
}

// ---------- Prompt builders ----------

function outlinePrompt(pack: any) {
  const A = pack.tripA?.name;
  const B = pack.tripB?.name;

  return [
    `You are an editorial engine for GolfTripIndex (GTI).`,
    `Write a polished long-form Head-to-Head article: ${A} vs ${B}.`,
    ``,
    `Intro requirements:`,
    '- Start with exactly a header with the two trips names. Example, formatted exactly: ## Trip A vs Trip B',
    `- After the header, then exactly two short paragraphs BEFORE "## The Golf".`,
    ``,
    `Hard requirements (must follow exactly):`,
    `- Use these exact markdown headings, in this exact order:`,
    `  ## The Golf`,
    `  ## Lodging`,
    `  ## Food and Drinks`,
    `  ## Beyond Golf`,
    `  ## Logistics and Travel`,
    `  ## Value`,
    `  ## Vibe`,
    `  ## The Verdict`,
    `- Under EACH of those headings, write 2 paragraphs then end with a standalone line that begins exactly with: **Winner:**`,
    `  Example: **Winner: ${A}**`,
    ``,
    `Hard requirements (must follow exactly):`,
    `- Do not mention AI.`,
    `- Do NOT mention "GTI", "GolfTripIndex", "pack", "data", "dataset", or "outline".`,
    `- Do NOT include any numeric ratings or scores (no decimals like 9.2; no "10 vs 9").`,
    `- Do not invent facts. Use ONLY the provided data pack + outline.`,
    `- Be decisive and GTI-like: no filler, no generic phrasing.`,
    `- Use ONLY the data in the JSON pack. Do not add outside facts.`,
    `- Do not mention GTI or specific GTI scores.`,
    `- Do not provide actual scores anywhere in the text response.`,
    `- Winners should align with GTI ratings when present (Golf/Lodging/Food/Vibe/Logistics/Value/Overall).`,
    `- If a rating is missing or the numbers are even, you may choose TIE.`,
    `- Keep points specific and grounded in the pack.`,
    ``,
    `Trip A: ${A}`,
    `Trip B: ${B}`,
    ``,
    `JSON pack:`,
    JSON.stringify(pack),
     ].join("\n");
}

function articlePromptString(pack: any, outline: Outline) {
  const A = pack.tripA?.name;
  const B = pack.tripB?.name;

  return [
    `You are the GolfTripIndex (GTI) editorial voice.`,
    `Write a polished long-form Head-to-Head article: ${A} vs ${B}.`,
    ``,
    `Rules:`,
    `- Do not mention AI.`,
    `- Do not invent facts. Use ONLY the provided data pack + outline.`,
    `- Use real markdown headings with a space after hashes.`,
    `- Each section except for the intro must include a clear "Winner: ..." line (Trip A name, Trip B name, or Tie).`,
    `- Be decisive and GTI-like: no filler, no generic phrasing.`,
    ``,
    `Intro requirements:`,
    '- Start with exactly a header with the two trips names. Example, formatted exactly: ## Trip A vs Trip B',
    `- After the header, then exactly two short paragraphs BEFORE "## The Golf".`,
    ``,
    `Required sections in order:`,
    `  ## The Golf`,
    `  ## Lodging`,
    `  ## Food and Drinks`,
    `  ## Beyond Golf`,
    `  ## Logistics and Travel`,
    `  ## Value`,
    `  ## Vibe`,
    `  ## The Verdict`,
    `- Under EACH of those headings, write 2 paragraphs then end with a standalone line that begins exactly with: **Winner:**`,
    `  Example: **Winner: ${A}**`,
    `  The winner line must be on it's own line, not part of the previous paragraph`,
    `  The winner should just show the Trip's name, not anything such as Trip A or Trip B.`,
    `  Do not add any text after the winner is declared. No rationale.`,
    ``,
    `Outline (authoritative):`,
    JSON.stringify(outline),
    ``,
    `Data pack (only source of truth):`,
    JSON.stringify(pack),
  ].join("\n");
}

// ---------- Core generator ----------
export async function generateHeadToHead(pack: any): Promise<GenerateResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  // 1) Outline call (Structured Output)
    const outlineResp = await client.responses.create({
    model: "gpt-5-mini",
    input: outlinePrompt(pack),
    text: {
        format: {
        type: "json_schema",
        ...OUTLINE_JSON_SCHEMA, // <-- spreads { name, strict, schema }
        },
    },
    });

    const outlineText = outlineResp.output_text ?? "";
    const outlineJson = safeJsonParse(outlineText);
    const outline = OutlineSchema.parse(outlineJson);

    const packForArticle = redactPackForArticle(pack);

    const articleResp = await client.responses.create({
        model: "gpt-5-mini",
        input: articlePromptString(packForArticle, outline),
        reasoning: { effort: "low" },
        max_output_tokens: 2200,
    });

    let article_markdown = (articleResp.output_text ?? "").trim();

    if (!article_markdown || article_markdown.length < 50) {
        throw new Error(
            `Empty article_markdown from model. Got length=${article_markdown?.length ?? 0}`
        );
    }


  // 3) Teaser: generate from outline thesis (deterministic-ish)
  const teaser = outline.thesis.length > 180 ? outline.thesis.slice(0, 180).trim() + "…" : outline.thesis;

  /* 3) Teaser: constrained generation (<= 180 chars)
  const teaserResp = await client.responses.create({
    model: "gpt-5-mini",
    input: teaserPrompt(packForArticle, outline),
    text: {
      format: {
        type: "json_schema",
        ...TEASER_JSON_SCHEMA,
      },
    },
  });

  const teaserJson = safeJsonParse(teaserResp.output_text ?? "");
  let teaser = TeaserSchema.parse(teaserJson).teaser.trim();*/

  // Final safety checks
  /*if (containsForbidden(teaser)) {
    teaser = clampTeaser(outline.thesis, 180);
  }*/

  // 4) Facts sidebar: deterministic from pack
  const facts_sidebar = factsSidebarFromPack(pack);

  return { teaser, article_markdown, facts_sidebar, outline };
}
