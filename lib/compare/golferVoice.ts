// lib/compare/golferVoice.ts

export type VoiceOptions = {
  // If true, adds stronger constraints (more fragments, shorter sentences).
  strictCadence?: boolean;

  // If true, includes a style reference paragraph.
  includeStyleReference?: boolean;
};

const FORBIDDEN_WORDS = [
  // Your existing list + common AI travel-ad drift
  "tapestry",
  "testament",
  "bespoke",
  "quintessential",
  "oasis",
  "nestled",
  "boasting",
  "unparalleled",
  "hidden gem",
  "world-class",
  "bucket list",
];

const HARD_BANS = [
  // Must never appear
  "gti",
  "golftripindex",
  "pack",
  "dataset",
  "outline",
  "ai",
];

const GOLFER_LEXICON = [
  "stout",
  "twitchy",
  "scoreable",
  "ball-in-the-wind",
  "asks a question",
  "will bite you",
  "gettable",
  "no let-up",
  "late in the round",
  "post up",
  "first-tee nerves",
  "second-loop fatigue",
  "beer tastes better",
  "hang after 36",
  "at the turn",
  "firm and fast",
  "shot-making",
  "the walk",
  "pure",
];

const SOFT_REPLACEMENTS: Array<{ from: string; to: string }> = [
  { from: "challenging", to: "asks a lot" },
  { from: "strategic", to: "forces a choice" },
  { from: "memorable", to: "sticks with you" },
  { from: "difficult", to: "will bite you" },
];

export function buildHeadToHeadPrompt(
  A: string,
  B: string,
  opts: VoiceOptions = {}
): string {
  const strict = opts.strictCadence ?? true;
  const includeRef = opts.includeStyleReference ?? true;

  const cadenceRules = strict
    ? [
        "- Average sentence length: 8–20 words.",
        "- Each paragraph must be 4–6 sentences.",
        "- Each paragraph must be at least 80 words. No filler. Use golf actions to get there.",
        "- Each paragraph must include: an initial observation, AND a second beat that deepens it.",
        "- 1 sentence per paragraph must be a fragment.",
        "- Avoid transitions like “however,” “moreover,” “ultimately.”",
        "- Prefer punchy observations over explanations.",
        "- Do not explain why something is good or bad. State it. Move on.",
        "- Do not write skinny paragraphs. Each paragraph must be at least 60 words.",
        "- No bullet lists inside sections.",
      ]
    : [
        "- Keep sentences somewhat short and spoken.",
        "- Use at least occasional fragments.",
        "- Avoid corporate transitions and recap lines.",
      ];

  const styleReference = includeRef
    ? `
Style reference (do not copy facts; mimic cadence only):

“The walk matters here. You feel it by the 12th. Greens start leaning, misses get expensive, and the group goes quiet for a few holes. That’s usually a good sign. If you’re still smiling at the turn, you picked the right place.”
`.trim()
    : "";

  // NOTE: Keep your structure rules exactly as you want them.
  return [
    `You are a scratch golfer and grizzled travel vet who has played the Top 100.`,
    `You plan two annual trips: one with 4 guys, one with 12–16.`,
    `Voice: conversational, authoritative, slightly irreverent. Like a Fried Egg / No Laying Up contributor.`,
    ``,
    `Task: Write a polished long-form Head-to-Head: ${A} vs ${B}.`,
    ``,
    `Approved Golfer Language (prefer these exact words/phrases when they fit):`,
    `- ${GOLFER_LEXICON.join("\n- ")}`,
    ``,
    `Soft-ban replacements:`,
    ...SOFT_REPLACEMENTS.map((r) => `- instead of "${r.from}" → "${r.to}"`),
    ``,
    `Voice Rules:`,
    `- Use golf slang naturally (no try-hard lists).`,
    `- Focus on “The Loop”: describe the round experience, not scenery.`,
    `- Architecture over aesthetics: routing, green complexes, bunkering.`,
    `- Buddy Test: settling bets, hangs after 36, post-round vibe.`,
    `- Name a loser when it's a loser (logistics can be a slog).`,
    `- Avoid marketing fluff. If it's good, call it “elite” or “a heater.”`,
    `- Strictly avoid these words/phrases: ${FORBIDDEN_WORDS.join(", ")}.`,
    `- Don't balance the comparison” rule: “If one trip wins a section, don't soften it.”`,
    `- Try to add 1-2 punchlines per article: one short, slightly sarcastic line per section.`,
    ``,
    `Sentence Rules:`,
    ...cadenceRules,
    ``,
    styleReference ? `${styleReference}\n` : "",
    `Hard rules (must follow exactly):`,
    `- Do NOT mention "GTI", "GolfTripIndex", "pack", "data", "dataset", "outline", or AI.`,
    `- Do NOT include numeric ratings or scores (no "10 vs 9", no "9.2", no "8/10").`,
    `- You MAY mention course years opened and general rankings if present.`,
    `- Start with a header exactly: ## ${A} vs ${B}`,
    `- After the header, write exactly two short intro paragraphs before "## The Golf".`,
    `- Under EACH required section heading, write exactly 2 paragraphs and then a standalone winner line formatted exactly: **Winner: <Trip Name or Tie>**`,
    `- The winner line must be on its own line, and contain NOTHING after it.`,
    ``,
    `Before final output, do a silent rewrite pass:`,
    `- Remove any sentence that sounds like a travel ad.`,
    `- Replace abstract nouns with concrete golf actions.`,
    `- If a sentence could be read in a boardroom, rewrite it.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Lightweight “sounds like ChatGPT” + hard-rule compliance checks.
 * Returns an array of issues. Empty array = clean enough.
 */
export function lintGolferOutput(text: string): string[] {
  const issues: string[] = [];
  const lower = text.toLowerCase();

  // Hard bans
  for (const w of HARD_BANS) {
    if (lower.includes(w)) issues.push(`Hard-ban term present: "${w}"`);
  }

  // Forbidden words/phrases
  for (const w of FORBIDDEN_WORDS) {
    if (lower.includes(w.toLowerCase()))
      issues.push(`Forbidden phrase present: "${w}"`);
  }

  // Numeric scores / ratings patterns
  // - 9.2, 10 vs 9, 8/10, 9 out of 10, etc.
  const numericPatterns: RegExp[] = [
    /\b\d+(\.\d+)?\s*vs\s*\d+(\.\d+)?\b/i,
    /\b\d+(\.\d+)?\/\d+(\.\d+)?\b/,
    /\b\d+(\.\d+)?\s*out of\s*\d+(\.\d+)?\b/i,
    /\b\d{1,2}\.\d\b/, // 9.2 style
  ];
  if (numericPatterns.some((re) => re.test(text)))
    issues.push("Numeric rating/score detected.");

  // “AI voice” tells
  const aiTellPhrases = [
    "in conclusion",
    "overall",
    "ultimately",
    "moreover",
    "however",
    "it is important to note",
    "this highlights",
    "a key takeaway",
  ];
  for (const p of aiTellPhrases) {
    if (lower.includes(p)) issues.push(`AI-tell phrase present: "${p}"`);
  }

  // Overlong sentences (rough heuristic)
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const longOnes = sentences.filter((s) => s.split(" ").length > 22);
  if (longOnes.length >= 3)
    issues.push(`Too many long sentences (${longOnes.length} > 2).`);

  return issues;
}

/**
 * Builds a revision prompt that preserves structure but fixes violations.
 */
export function buildRevisionPrompt(
  originalPrompt: string,
  badOutput: string,
  issues: string[]
): string {
  return [
    originalPrompt,
    ``,
    `---`,
    `Your previous draft has issues. Fix them and output ONLY the corrected article.`,
    `Issues detected:`,
    ...issues.map((i) => `- ${i}`),
    ``,
    `Rules for the rewrite:`,
    `- Keep the required structure exactly.`,
    `- Remove banned words/phrases.`,
    `- Remove numeric scores/ratings completely.`,
    `- Tighten cadence: shorter sentences, at least one fragment per paragraph.`,
    `- Make it sound like a golfer talking to golfers.`,
    ``,
    `Previous draft (for reference):`,
    badOutput,
  ].join("\n");
}
