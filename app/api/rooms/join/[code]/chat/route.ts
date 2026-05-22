// app/api/rooms/join/[code]/chat/route.ts
import { NextResponse } from "next/server";
import type { QueryResult } from "pg";
import OpenAI from "openai";
import { getPgClient } from "@/lib/db";
import { mergeRoomState } from "@/lib/roomState";
import { gtiSearch, gtiResolveAnchor, getTripDetailBySlug, getTripsTop100Counts, getTopTripsByRating } from "@/lib/gti";
import type { GTISearchHit } from "@/lib/types";
import type { TripRatingMetric } from "@/lib/gti";
import { runCaddieTurnShared } from "@/lib/caddieEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Option = { id: string; label: string; value?: string };

type AssistantPayload =
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

function clamp<T>(arr: T[], max: number) {
  return arr.length <= max ? arr : arr.slice(arr.length - max);
}

function stripJsonFences(s: string) {
  return s
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalize(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-");
}

function matchOption(content: string, options: Option[]) {
  const n = normalize(content);
  const exact = options.find((o) => normalize(o.label) === n || normalize(o.id) === n || normalize(o.value) === n);
  if (exact) return exact;

  const soft = options.find((o) => {
    const l = normalize(o.label);
    return l === n || l.startsWith(n) || n.startsWith(l);
  });

  return soft ?? null;
}

function detectPublicInfoNeed(text: string) {
  const t = text.toLowerCase();
  return {
    airportsOrDrive:
      /\bairport\b/.test(t) ||
      /\bairports\b/.test(t) ||
      /\bdrive time\b/.test(t) ||
      /\bdriving distance\b/.test(t) ||
      /\bhow far\b/.test(t) ||
      /\bdistance\b/.test(t),
  };
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function defaultState() {
  return {
    mode: null as null | "plan" | "trip" | "look" | "freeform",
    activeTripSlug: null as null | string,
    activeTripName: null as null | string,
    activeState: null as null | string,

    players: null as null | number,
    daysOfGolf: null as null | number,
    timeframe: null as null | string,
    budgetTier: null as null | 1 | 2 | 3 | 4 | 5,
    vibe: [] as string[],
    top100Focus: null as null | boolean,
    homeAirport: null as null | string,

    step: "entry" as string,
  };
}

function guidedResponseForEntrySelection(sel: "plan" | "trip" | "look") {
  if (sel === "plan") {
    const payload: AssistantPayload = {
      kind: "question",
      step: "plan_basics",
      text: "Got it. A few quick basics so I can recommend 1–3 trips. What best describes your trip shape?",
      allowFreeText: true,
      options: [
        { id: "2-3", label: "2–3 days (quick trip)" },
        { id: "3-4", label: "3–4 days (long weekend)" },
        { id: "5+", label: "5+ days (full trip)" },
        { id: "not-sure", label: "Not sure yet" },
      ],
    };

    const content =
      "Got it. A few quick basics so I can recommend 1–3 trips:\n\n" +
      "1) How many days of golf?\n" +
      "2) Rough budget (1–5 cost tier)?\n" +
      "3) Any vibe preferences (links-style, modern minimalist, classic parkland, resort, off-the-grid)?\n\n" +
      "You can answer in one line, or tap a button.";

    const statePatch = { mode: "plan", step: "plan_basics" };
    return { content, payload, statePatch };
  }

  if (sel === "trip") {
    const payload: AssistantPayload = {
      kind: "question",
      step: "trip_pick",
      text: "Which trip are you looking at?",
      allowFreeText: true,
      options: [
        { id: "type", label: "I’ll type the trip name" },
        { id: "top", label: "Show me a few top trips" },
      ],
    };

    const content =
      "Trip details — perfect.\n\n" +
      "Tell me the trip name (or destination), and I’ll pull:\n" +
      "- courses included (TripCourses)\n" +
      "- nearby “want more” options\n" +
      "- food & lodging overview\n\n" +
      "What trip are you looking at?";

    const statePatch = { mode: "trip", step: "trip_pick" };
    return { content, payload, statePatch };
  }

  const payload: AssistantPayload = {
    kind: "question",
    step: "look_ideas",
    text: "Want a few ideas to explore?",
    allowFreeText: true,
    options: [
      { id: "top100", label: "Trips with Top 100 courses" },
      { id: "winter", label: "Best winter trips" },
      { id: "vibe", label: "Trips with the best vibe" },
      { id: "price", label: "Best trips by price range" },
    ],
  };

  const content =
    "Feel free to ask me anything. A few ideas to get you started:\n" +
    "- Trips with Top 100 courses\n" +
    "- Best winter trips\n" +
    "- Best trips by price range\n" +
    "- Trips with the best vibe\n\n" +
    "Tap one, or just tell me what you’re curious about.";

  const statePatch = { mode: "look", step: "look_ideas" };
  return { content, payload, statePatch };
}

async function fetchPublicInfo(originUrl: string, near: string) {
  const url = `${originUrl}/api/tools/public_info`;
  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ near, includeAirports: true, includeGolfAlongRoute: false }),
    }),
    8000,
    "public_info"
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "public_info failed");
  return json;
}

function isRestrictedTopic(text: string) {
  const t = String(text || "").toLowerCase();

  // ---- HARD BLOCK TOPICS ----

  // Medical / mental health
  const medical =
    /\bdiagnos(e|is)\b|\bsymptom(s)?\b|\btreatment\b|\bmedication\b|\bdosage\b|\bprescription\b|\bdoctor\b|\bside effect(s)?\b/.test(t);

  const mentalHealth =
    /\bdepress(ed|ion)\b|\banxiety\b|\bpanic attack\b|\btherapy\b|\btherapist\b|\bbipolar\b|\bschizophren(ia|ic)\b|\bptsd\b/.test(t);

  // Legal
  const legal =
    /\blawyer\b|\battorney\b|\blegal advice\b|\bsue\b|\bliability\b|\bcontract\b|\bsubpoena\b|\bnda\b|\bsettlement\b/.test(t);

  // Financial
  const financial =
    /\binvest\b|\bstock(s)?\b|\bportfolio\b|\b401k\b|\bira\b|\btaxes?\b|\bloan\b|\bmortgage\b|\binsurance\b|\bretirement\b/.test(t);

  // Crypto
  const crypto =
    /\bcrypto\b|\bbitcoin\b|\bethereum\b|\bsolana\b|\bnft\b|\btoken\b|\bairdrop\b|\bwallet\b|\bdefi\b/.test(t);

  // Sex / nudity
  const sexOrNudity =
    /\bsex\b|\bnude\b|\bnudity\b|\bporn\b|\berotic\b|\bnsfw\b/.test(t);

  // Celebrities / politics
  const celebrities =
    /\bcelebrity\b|\bactor\b|\bactress\b|\bsinger\b|\brapper\b|\bkim kardashian\b|\btaylor swift\b|\blebron\b|\btrump\b|\bobama\b|\bbiden\b/.test(t);

  const politics =
    /\belection\b|\bvote\b|\bpolitic(s|al)\b|\bcongress\b|\bsenate\b|\bpresident\b|\bdemocrat\b|\brepublican\b/.test(t);

  // Violence / self-harm / drugs
  const violence =
    /\bkill\b|\bmurder\b|\bassault\b|\bweapon\b|\bgun\b|\bshoot\b|\bstab\b|\bterror\b|\bbomb\b/.test(t);

  const selfHarm =
    /\bsuicide\b|\bself[-\s]*harm\b|\bkill myself\b|\bend my life\b/.test(t);

  const drugs =
    /\bcocaine\b|\bheroin\b|\bmeth\b|\bfentanyl\b|\bopioid\b|\bweed\b|\bmarijuana\b|\bthc\b|\blsd\b|\bmdma\b/.test(t);

  // Hate / harassment / extremism
  const hateOrHarassment =
    /\bhate\b|\bracist\b|\bnazi\b|\bwhite power\b|\bslur\b|\bharass\b|\bbully\b/.test(t);

  const extremism =
    /\bisis\b|\bal[-\s]*qaeda\b|\bextremist\b|\bterrorist\b/.test(t);

  // Personal relationship advice
  const relationshipAdvice =
    /\bmy (boyfriend|girlfriend|husband|wife)\b|\bbreak up\b|\bdivorce\b|\bcheating\b|\brelationship advice\b/.test(t);

  // Booking / payment / agent behavior
  const agentBehavior =
    /\bbook\b|\breserve\b|\bpurchase\b|\bbuy\b|\bpay\b|\bpayment\b|\bcredit card\b|\bcheckout\b|\brefund\b/.test(t);

  // Personal data
  const personalData =
    /\bsocial security\b|\bssn\b|\bpassword\b|\bcredit card\b|\baddress\b|\bphone number\b/.test(t);

  const restricted =
    medical ||
    mentalHealth ||
    legal ||
    financial ||
    crypto ||
    sexOrNudity ||
    celebrities ||
    politics ||
    violence ||
    selfHarm ||
    drugs ||
    hateOrHarassment ||
    extremism ||
    relationshipAdvice ||
    agentBehavior ||
    personalData;

  return restricted;
}

function restrictedTopicReply() {
  return {
    assistantContent:
      "I can’t help with that topic. Ask me anything else and I’ll do my best (I’ll search GTI’s Airtable first, then the open web if needed).",
    assistantPayload: { kind: "info" as const },
    state_patch: {},
  };
}

function outOfScopeReply() {
  return {
    assistantContent:
      "I can only help with golf trips and trip planning context (trips, courses, nearby courses, lodging, restaurants, airports/drive distances, weather, booking timelines). Ask me anything in that scope.",
    assistantPayload: { kind: "info" as const },
    state_patch: {},
  };
}

function extractPossiblePlacePhrase(input: string): string | null {
  const s = String(input || "").trim();
  if (!s) return null;

  // Pull a phrase after "at/in/near" (matches your needle logic)
  const m =
    s.match(/\bnear\s+([A-Za-z0-9'’.\- ]{3,60})/i) ||
    s.match(/\bat\s+([A-Za-z0-9'’.\- ]{3,60})/i) ||
    s.match(/\bin\s+([A-Za-z0-9'’.\- ]{3,60})/i);

  if (!m?.[1]) return null;
  return m[1].trim();
}

function extractRatingMetric(text: string): TripRatingMetric | null {
  const t = text.toLowerCase();

  // Most direct keywords
  if (/\bgolf\b/.test(t) && (/\bbest\b|\btop\b|\bhighest\b|\brating\b|\bscore\b/.test(t))) return "golf";
  if (/\bvibe\b|\batmosphere\b|\bfeel\b/.test(t)) return "vibe";
  if (/\bfood\b|\brestaurants?\b|\bdining\b/.test(t)) return "food";
  if (/\blodging\b|\bhotel\b|\bstay\b|\brooms?\b|\bresort\b/.test(t)) return "lodging";
  if (/\boverall\b|\bbest trip\b|\btop trip\b/.test(t)) return "overall";

  // If they ask "best rated trips" without specifying, default overall
  if (/\bbest\b|\btop\b|\bhighest\b/.test(t) && /\brated\b|\brating\b|\bscore\b/.test(t)) return "overall";

  return null;
}

function isRecommendationsIntent(text: string) {
  const t = text.toLowerCase();

  // Direct “ranking / best” questions
  const rankingAsk =
    /\bwhich\b.*\btrips?\b/.test(t) ||
    /\bwhat\b.*\btrips?\b/.test(t) ||
    /\btrips?\b.*\b(best|top|highest|ranked)\b/.test(t) ||
    /\b(best|top|highest)\b.*\btrips?\b/.test(t);

  // “planning / suggest / recommend” asks
  const planningAsk =
    /\brecommend\b|\bsuggest\b|\bideas\b|\bwhere should we go\b|\bwhere to go\b|\bplanning\b|\bplan\b/.test(t);

  // Must be trip-level (avoid triggering for “best restaurants at X”)
  const tripLevel =
    /\btrip\b|\btrips\b|\bgolf trips?\b/.test(t) ||
    /\bwhere should we go\b|\bwhere to go\b/.test(t);

  return (planningAsk || rankingAsk) && tripLevel;
}

function metricLabel(metric: TripRatingMetric) {
  switch (metric) {
    case "golf": return "golf";
    case "vibe": return "vibe";
    case "food": return "food";
    case "lodging": return "lodging";
    case "overall": return "overall";
  }
}

function metricValue(t: any, metric: TripRatingMetric): number {
  switch (metric) {
    case "golf": return Number(t.golfRating ?? 0);
    case "vibe": return Number(t.vibeRating ?? 0);
    case "food": return Number(t.foodRating ?? 0);
    case "lodging": return Number(t.lodgingRating ?? 0);
    case "overall": return Number(t.overallRating ?? 0);
  }
}

async function fetchPublicGolfDetails(originUrl: string, query: string) {
  const url = `${originUrl}/api/tools/public_golf_details`;
  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ query }),
    }),
    10000,
    "public_golf_details"
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "public_golf_details failed");
  return json;
}

async function fetchPublicWeb(originUrl: string, query: string) {
  const url = `${originUrl}/api/tools/public_web`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ query, maxResults: 6, intent: "golf" }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "public_web failed");
  return json;
}

function detectWebGolfDetailsNeed(text: string) {
  const t = String(text || "").toLowerCase();

  // Anything in this list = allowed to go to public web (AFTER Airtable)
  const patterns: RegExp[] = [
    // holes / routing / nines
    /\bhole(s)?\b/,
    /\bbest\s+hole(s)?\b/,
    /\bsignature\s+hole(s)?\b/,
    /\brouting\b/,
    /\bfront\s*nine\b/,
    /\bback\s*nine\b/,
    /\b18\s*holes?\b/,
    /\b18\/18\b/,

    // par breakdown
    /\bpar\s*3s?\b/,
    /\bpar\s*4s?\b/,
    /\bpar\s*5s?\b/,

    // greens / fairways / bunkers / conditioning
    /\bgreens?\b/,
    /\bgreen\s*speed\b/,
    /\bgreen\s*complex(es)?\b/,
    /\bfairways?\b/,
    /\bbunkering\b/,
    /\bbunkers?\b/,
    /\bconditions\b/,
    /\bcourse\s*conditions\b/,
    /\bfirm(ness)?\b/,
    /\bcontouring\b/,
    /\bturf\b/,
    /\bturf\s*type\b/,

    // architecture
    /\barchitect\b/,
    /\bcourse\s*architect\b/,

    // walk / carts / caddies
    /\bwalkable\b/,
    /\bwalking[-\s]*only\b/,
    /\bcarts?\b/,
    /\bcaddies?\b/,
    /\bforecaddie\b/,

    // pace / replay / 36/day
    /\bpace\b/,
    /\bpace\s*of\s*play\b/,
    /\b36\s+a\s+day\b/,
    /\btwo\s+rounds\b/,
    /\breplay\b/,
    /\breplay\s+rate\b/,

    // scenery / views
    /\bviews?\b/,
    /\bscenery\b/,
    /\bscenic\b/,

    // weather / wind / rain / time of year
    /\bweather\b/,
    /\bwind\b/,
    /\brain\b/,
    /\bbest\s+month\b/,
    /\bbest\s+season\b/,
    /\bbest\s+time\s+of\s+year\b/,

    // facilities / food & drink / clubhouse
    /\bdriving\s*range\b/,
    /\bpractice\s*area\b/,
    /\bpractice\s*facility\b/,
    /\bfood\b/,
    /\bdrink\b/,
    /\bfood\s+and\s+drink\b/,
    /\bbar\b/,
    /\blocker\s*room\b/,
    /\bclubhouse\b/,
    /\bslope\b/,
    /\bcourse\s*slope\b/,
  ];

  return patterns.some((re) => re.test(t));
}

function isGolfDetailsIntent(text: string) {
  const t = String(text || "").toLowerCase();
  return /\bhole(s)?\b|\bbest holes\b|\bpar\s*3s?\b|\bpar\s*4s?\b|\bpar\s*5s?\b|\brouting\b|\bfront nine\b|\bback nine\b|\bgreens?\b|\bgreen speed\b|\bgreen complexes\b|\bfairways?\b|\bbunkers?\b|\bbunkering\b|\bconditions?\b|\bpace\b|\bpace of play\b|\bcadd(y|ies)\b|\barchitect\b|\bwalkable\b|\bwalking-only\b|\bcarts?\b|\bcontouring\b|\bfirm(ness)?\b|\b36 a day\b|\btwo rounds\b|\breplay\b|\breplay rate\b|\bsignature holes\b|\bviews\b|\bscenery\b|\bweather\b|\bwind\b|\brain\b|\bturf type\b|\bbest month\b|\bbest season\b|\bbest time of year\b|\bdriving range\b|\bpractice (area|facility)\b|\blocker room\b|\bclubhouse\b|\bforecaddie\b|\bfood\b|\bdrink\b|\bbar\b|\bfood and drink\b|\bslop(e)?\b|\byards?\b|\btees?\b/.test(
    t
  );
}

function isAirtableWeak(gtiResults: any[], tripDetail: any) {
  const hasHits = Array.isArray(gtiResults) && gtiResults.length > 0;
  const hasTrip =
    !!tripDetail?.trip?.name ||
    !!tripDetail?.trip?.fullDescription ||
    !!tripDetail?.trip?.foodAndLodgingOverview ||
    !!tripDetail?.trip?.wantMore ||
    !!tripDetail?.trip?.dataDump;

  const hasCourses =
    (tripDetail?.courses?.must_play?.length ?? 0) +
      (tripDetail?.courses?.should_play?.length ?? 0) +
      (tripDetail?.courses?.want_more?.length ?? 0) >
    0;

  return !(hasHits || hasTrip || hasCourses);
}

function isDisallowedTopic(text: string) {
  const t = String(text || "").toLowerCase();

  // medical / mental health / legal / financial / sex / politics / violence / drugs etc.
  // Keep broad; false positives are acceptable because user explicitly wants refusal.
  const medical =
    /\b(symptom|diagnos|treat|treatment|medication|dose|dosage|side effect|pain|rash|fever|infection|blood pressure|diabetes|cancer|asthma|allerg(y|ies)|doctor|er|urgent care|hospital|lab result|mri|ct scan|x-?ray|antibiotic|ibuprofen|acetaminophen|tylenol|advil)\b/.test(
      t
    );

  const mentalHealth =
    /\b(depress(ed|ion)|anxiety|panic|ptsd|bipolar|adhd|therapy|therapist|counsel(or|ing)|self harm|suicid(al|e))\b/.test(
      t
    );

  const legal =
    /\b(lawsuit|attorney|lawyer|legal advice|contract|nda|sue|court|liable|liability)\b/.test(t);

  const financial =
    /\b(invest|investment|stock|portfolio|401k|ira|tax(es)?|mortgage|loan|interest rate|credit score|budgeting)\b/.test(
      t
    );

  const sex =
    /\b(sex|nude|porn|onlyfans|fetish|erection|std|sti)\b/.test(t);

  const politics =
    /\b(election|president|senator|congress|democrat|republican|campaign|vote|politic(s|al))\b/.test(t);

  const violence =
    /\b(kill|murder|shoot(ing)?|bomb|weapon|assault|fight|stab)\b/.test(t);

  const drugs =
    /\b(cocaine|heroin|meth|weed|marijuana|thc|lsd|mushroom(s)?|opioid|fentanyl)\b/.test(t);

  const crypto =
    /\b(crypto|bitcoin|btc|eth|ethereum|token|defi|nft)\b/.test(t);

  const bookingAgent =
    /\b(book(ing)?\b.*(flight|hotel|airbnb|tee time)|pay(ment)?|credit card|purchase|checkout)\b/.test(t);

  const celebrity =
    /\b(kardashian|taylor swift|beyonc(e|é)|lebron|messi)\b/.test(t) || /\bcelebrity\b/.test(t);

  return (
    medical ||
    mentalHealth ||
    legal ||
    financial ||
    sex ||
    politics ||
    violence ||
    drugs ||
    crypto ||
    bookingAgent ||
    celebrity
  );
}

function disallowedTopicReply() {
  return {
    assistantContent:
      "I can’t help with that topic. I can help with golf trips and golf details (trips, courses, architecture, lodging, food, weather, airports/drive distances).",
    assistantPayload: { kind: "info" as const },
    state_patch: {},
  };
}


export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const openai = getOpenAIClient();

  const { code } = await ctx.params;
  const joinCode = (code || "").toString().toUpperCase();
  const originUrl = new URL(req.url).origin;

  const body = await req.json().catch(() => ({}));
  const contentRaw = body?.content;

  if (!contentRaw || typeof contentRaw !== "string") {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  const content = contentRaw.trim();
  if (!content) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  const client = getPgClient();

  try {
    // 1) Resolve room
    const roomRes = (await withTimeout(
      client.query(`select id from public.rooms where join_code = $1`, [joinCode]),
      3000,
      "room lookup"
    )) as QueryResult<{ id: string }>;

    if (roomRes.rowCount === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const roomId = roomRes.rows[0].id;

    // 2) Load last assistant payload (for step + option matching)
    const lastAssistantRes = (await withTimeout(
      client.query(
        `select payload, content
         from public.messages
         where room_id = $1 and kind = 'assistant'
         order by created_at desc
         limit 1`,
        [roomId]
      ),
      3000,
      "last assistant"
    )) as QueryResult<{ payload: any; content: string }>;

    const lastAssistantPayload: AssistantPayload | null =
      lastAssistantRes.rows?.[0]?.payload && typeof lastAssistantRes.rows[0].payload === "object"
        ? lastAssistantRes.rows[0].payload
        : null;

    // 3) Load/init room_state
    const stateRes = (await withTimeout(
      client.query(
        `insert into public.room_state (room_id, state)
         values ($1, $2::jsonb)
         on conflict (room_id) do update set updated_at = now()
         returning state, updated_at`,
        [roomId, JSON.stringify(defaultState())]
      ),
      3000,
      "load/init room_state"
    )) as QueryResult<{ state: any; updated_at: string }>;

    const roomState = stateRes.rows?.[0]?.state ?? defaultState();

    // 4) Insert user message
    const userInsert = (await withTimeout(
      client.query(
        `insert into public.messages (room_id, kind, content, payload)
         values ($1, 'user', $2, $3::jsonb)
         returning *`,
        [roomId, content, JSON.stringify({ kind: "user_input", meta: body?.meta ?? null })]
      ),
      3000,
      "insert user"
    )) as QueryResult<any>;
    const userMessage = userInsert.rows[0];

    // 4.5) Out-of-scope guard (no Airtable, no OpenAI)
    if (isRestrictedTopic(content)) {
      const payload = restrictedTopicReply();

      const assistantInsert = (await withTimeout(
        client.query(
          `insert into public.messages (room_id, kind, content, payload)
          values ($1, 'assistant', $2, $3::jsonb)
          returning *`,
          [roomId, payload.assistantContent, JSON.stringify(payload.assistantPayload)]
        ),
        3000,
        "insert assistant (restricted)"
      )) as QueryResult<any>;

      return NextResponse.json(
        {
          userMessage,
          assistantMessage: assistantInsert.rows[0],
          state: roomState,
          updated_at: new Date().toISOString(),
        },
        { status: 201 }
      );
    }

        // 4.6) FAST PATH: “most Top 100 courses by trip” (no OpenAI)
    const t = content.toLowerCase();
    const asksMostTop100 =
      (t.includes("most") || t.includes("highest")) &&
      t.includes("top 100") &&
      (t.includes("trip") || t.includes("trips"));

    if (asksMostTop100) {
      const counts = await withTimeout(getTripsTop100Counts(), 12000, "getTripsTop100Counts");
      const top = counts?.[0];

      if (!top) {
        const assistantContent =
          "I don’t have enough Airtable data to calculate Top 100 counts by trip yet (TripCourses + Consolidated Ranking <= 100).";
        const assistantPayload = { kind: "info" as const };

        const assistantInsert = await withTimeout(
          client.query(
            `insert into public.messages (room_id, kind, content, payload)
             values ($1, 'assistant', $2, $3::jsonb)
             returning *`,
            [roomId, assistantContent, JSON.stringify(assistantPayload)]
          ),
          3000,
          "insert assistant (top100 missing)"
        );

        return NextResponse.json(
          {
            userMessage,
            assistantMessage: (assistantInsert as any).rows[0],
            state: roomState,
            updated_at: new Date().toISOString(),
          },
          { status: 201 }
        );
      }

      const runnerUp = counts.slice(1, 4);

      const assistantContent =
        `Based on GTI’s Airtable data, **${top.tripName}** has the most Top 100 courses included (**${top.top100Count}**).\n\n` +
        `Top 100 courses in that trip:\n` +
        top.top100Courses
          .slice(0, 12)
          .map((c: any) => `- ${c.courseName}${c.consolidatedRanking ? ` (#${c.consolidatedRanking})` : ""}`)
          .join("\n") +
        (top.top100Courses.length > 12 ? `\n- (and ${top.top100Courses.length - 12} more)` : "") +
        (runnerUp.length
          ? `\n\nNext best:\n` + runnerUp.map((r: any) => `- ${r.tripName}: ${r.top100Count}`).join("\n")
          : "");

      const assistantPayload = { kind: "info" as const };

      const assistantInsert = await withTimeout(
        client.query(
          `insert into public.messages (room_id, kind, content, payload)
           values ($1, 'assistant', $2, $3::jsonb)
           returning *`,
          [roomId, assistantContent, JSON.stringify(assistantPayload)]
        ),
        3000,
        "insert assistant (top100 computed)"
      );

      return NextResponse.json(
        {
          userMessage,
          assistantMessage: (assistantInsert as any).rows[0],
          state: roomState,
          updated_at: new Date().toISOString(),
        },
        { status: 201 }
      );
    }

    const metric = extractRatingMetric(content);
    const wantsRecs = isRecommendationsIntent(content);

    // 4.7) FAST PATH: rating leaderboard questions (Airtable-only, no OpenAI)
    // Examples:
    // - "Which golf trips have the best food?"
    // - "Best vibe trips?"
    // - "Top rated lodging trips?"
    const t2 = content.toLowerCase();
    const isTripRatingQuestion =
      !!metric &&
      (/\btrip\b|\btrips\b|\bgolf trips?\b/.test(t2)) &&
      (/\bbest\b|\btop\b|\bhighest\b|\brated\b|\brating\b|\bscore\b|\bleaderboard\b/.test(t2) || wantsRecs);

    if (isTripRatingQuestion) {
      const top = await withTimeout(getTopTripsByRating(metric, 7), 12000, `getTopTripsByRating:${metric}`);

      if (!top?.length) {
        const assistantContent =
          `I don’t have enough Airtable data to rank trips by ${metricLabel(metric)} yet. ` +
          `Specifically, I need ${metricLabel(metric)} ratings populated on the GolfTrips records.`;
        const assistantPayload: AssistantPayload = { kind: "info" };

        const assistantInsert = await withTimeout(
          client.query(
            `insert into public.messages (room_id, kind, content, payload)
            values ($1, 'assistant', $2, $3::jsonb)
            returning *`,
            [roomId, assistantContent, JSON.stringify(assistantPayload)]
          ),
          3000,
          "insert assistant (rating empty)"
        );

        return NextResponse.json(
          { userMessage, assistantMessage: (assistantInsert as any).rows[0], state: roomState, updated_at: new Date().toISOString() },
          { status: 201 }
        );
      }

      const label = metricLabel(metric);
      const assistantContent =
        `Based on GTI’s Airtable ratings, here are the **best ${label}** trips:\n\n` +
        top
          .map((x, i) => {
            const score = metricValue(x, metric);
            const extras =
              (x.costTier ? `cost tier ${x.costTier}` : "") +
              (x.leadTime ? `${x.costTier ? ", " : ""}lead time: ${x.leadTime}` : "") +
              (x.durationMinDays && x.durationMaxDays
                ? `${(x.costTier || x.leadTime) ? ", " : ""}${x.durationMinDays}–${x.durationMaxDays} days`
                : "");
            return `${i + 1}) ${x.name} — ${label} ${score ? `${score}/10` : "(rating not set)"}${extras ? ` (${extras})` : ""}`;
          })
          .join("\n") +
        `\n\nIf you tell me your **season** and **trip length**, I can narrow this to 1–3 best fits.`;

      const assistantPayload: AssistantPayload = { kind: "info" };

      const assistantInsert = await withTimeout(
        client.query(
          `insert into public.messages (room_id, kind, content, payload)
          values ($1, 'assistant', $2, $3::jsonb)
          returning *`,
          [roomId, assistantContent, JSON.stringify(assistantPayload)]
        ),
        3000,
        "insert assistant (rating leaderboard)"
      );

      // Persist planning mode (optional but helpful)
      const nextState = mergeRoomState(roomState, { mode: "plan" });
      await withTimeout(
        client.query(
          `insert into public.room_state (room_id, state)
          values ($1, $2::jsonb)
          on conflict (room_id) do update set state = excluded.state, updated_at = now()`,
          [roomId, JSON.stringify(nextState)]
        ),
        3000,
        "save room_state (rating leaderboard)"
      );

      return NextResponse.json(
        { userMessage, assistantMessage: (assistantInsert as any).rows[0], state: nextState, updated_at: new Date().toISOString() },
        { status: 201 }
      );
    }

    if (wantsRecs && metric) {
      const top = await withTimeout(getTopTripsByRating(metric, 5), 9000, `getTopTripsByRating:${metric}`);

      const label = metricLabel(metric);

      const assistantContent =
        `If **${label}** is the priority, here are strong GTI picks from Airtable:\n\n` +
        top
          .map((x, i) => {
            const score = metricValue(x, metric);
            const extras =
              (x.costTier ? `cost tier ${x.costTier}` : "") +
              (x.leadTime ? `${x.costTier ? ", " : ""}lead time: ${x.leadTime}` : "") +
              (x.durationMinDays && x.durationMaxDays
                ? `${(x.costTier || x.leadTime) ? ", " : ""}${x.durationMinDays}–${x.durationMaxDays} days`
                : "");

            return `${i + 1}) ${x.name} — ${label} ${score ? `${score}/10` : "(rating not set)"}${extras ? ` (${extras})` : ""}`;
          })
          .join("\n") +
        `\n\nIf you tell me (1) preferred season, (2) 3–4 vs 5+ days, and (3) your cost tier (1–5), I’ll narrow this to 1–3 trips.`;

      const assistantPayload: AssistantPayload = { kind: "info" };

      const assistantInsert = (await withTimeout(
        client.query(
          `insert into public.messages (room_id, kind, content, payload)
          values ($1, 'assistant', $2, $3::jsonb)
          returning *`,
          [roomId, assistantContent, JSON.stringify(assistantPayload)]
        ),
        3000,
        "insert assistant (rating recs)"
      )) as QueryResult<any>;

      const nextState = mergeRoomState(roomState, { mode: "plan" });

      await withTimeout(
        client.query(
          `insert into public.room_state (room_id, state)
          values ($1, $2::jsonb)
          on conflict (room_id) do update set state = excluded.state, updated_at = now()`,
          [roomId, JSON.stringify(nextState)]
        ),
        3000,
        "save room_state (rating recs)"
      );

      return NextResponse.json(
        {
          userMessage,
          assistantMessage: assistantInsert.rows[0],
          state: nextState,
          updated_at: new Date().toISOString(),
        },
        { status: 201 }
      );
    }

    if (wantsRecs && !metric) {
      const top = await withTimeout(getTopTripsByRating("overall", 5), 9000, "getTopTripsByRating:overall");

      const assistantContent =
        `Here are strong GTI picks from Airtable:\n\n` +
        top
          .map((x, i) => {
            const score = Number(x.overallRating ?? 0);
            const extras =
              (x.costTier ? `cost tier ${x.costTier}` : "") +
              (x.leadTime ? `${x.costTier ? ", " : ""}lead time: ${x.leadTime}` : "");

            return `${i + 1}) ${x.name} — overall ${score ? `${score}/10` : "(rating not set)"}${extras ? ` (${extras})` : ""}`;
          })
          .join("\n") +
        `\n\nWhat matters most to you: **golf**, **vibe**, **food**, **lodging**, or **overall**?`;

        const assistantPayload: AssistantPayload = {
          kind: "question",
          step: "plan_metric",
          text: "What should I optimize for?",
          allowFreeText: true,
          options: [
            { id: "golf", label: "Best golf" },
            { id: "vibe", label: "Best vibe" },
            { id: "food", label: "Best food" },
            { id: "lodging", label: "Best lodging" },
            { id: "overall", label: "Best overall" },
          ],
        };

        const assistantInsert = (await withTimeout(
          client.query(
            `insert into public.messages (room_id, kind, content, payload)
            values ($1, 'assistant', $2, $3::jsonb)
            returning *`,
            [roomId, assistantContent, JSON.stringify(assistantPayload)]
          ),
          3000,
          "insert assistant (metric prompt)"
        )) as QueryResult<any>;

        const nextState = mergeRoomState(roomState, { mode: "plan" });

        await withTimeout(
          client.query(
            `insert into public.room_state (room_id, state)
            values ($1, $2::jsonb)
            on conflict (room_id) do update set state = excluded.state, updated_at = now()`,
            [roomId, JSON.stringify(nextState)]
          ),
          3000,
          "save room_state (metric prompt)"
        );

        return NextResponse.json(
          {
            userMessage,
            assistantMessage: assistantInsert.rows[0],
            state: nextState,
            updated_at: new Date().toISOString(),
          },
          { status: 201 }
        );
      }



    // 5) Guided entry selection (deterministic)
    if (lastAssistantPayload?.kind === "question" && lastAssistantPayload?.step === "entry") {
      const options = Array.isArray(lastAssistantPayload.options) ? lastAssistantPayload.options : [];
      const matched = matchOption(content, options);

      const id = matched?.id;
      const sel = id === "plan" ? "plan" : id === "trip" ? "trip" : id === "look" ? "look" : null;

      if (sel) {
        const guided = guidedResponseForEntrySelection(sel);
        const nextState = mergeRoomState(roomState, guided.statePatch);

        await withTimeout(
          client.query(
            `insert into public.room_state (room_id, state)
             values ($1, $2::jsonb)
             on conflict (room_id) do update
             set state = excluded.state,
                 updated_at = now()`,
            [roomId, JSON.stringify(nextState)]
          ),
          3000,
          "save state (guided)"
        );

        const assistantInsert = (await withTimeout(
          client.query(
            `insert into public.messages (room_id, kind, content, payload)
             values ($1, 'assistant', $2, $3::jsonb)
             returning *`,
            [roomId, guided.content, JSON.stringify(guided.payload)]
          ),
          3000,
          "insert assistant (guided)"
        )) as QueryResult<any>;

        return NextResponse.json(
          { userMessage, assistantMessage: assistantInsert.rows[0], state: nextState, updated_at: new Date().toISOString() },
          { status: 201 }
        );
      }
    }

    // 6) History (last 30 from up to 200)
    const historyRes = (await withTimeout(
      client.query(
        `select kind, content
         from public.messages
         where room_id = $1
         order by created_at asc
         limit 200`,
        [roomId]
      ),
      4000,
      "load history"
    )) as QueryResult<{ kind: string; content: string }>;

    const history = clamp(historyRes.rows, 30);

    // 7) Airtable grounding + persistence (anchor + trip detail)
    let gtiResults: GTISearchHit[] = [];
    try {
      gtiResults = (await withTimeout(gtiSearch(content), 5000, "gtiSearch")) as any;
    } catch (e: any) {
      console.warn("GTI search failed:", e?.message ?? e);
      gtiResults = [];
    }

    let anchor: any = { kind: "none" };
    try {
      anchor = await withTimeout(gtiResolveAnchor(content), 5000, "gtiResolveAnchor");
    } catch (e: any) {
      console.warn("GTI anchor resolve failed:", e?.message ?? e);
      anchor = { kind: "none" };
    }

    // Anchor -> immediate state patch (so we persist trip/state even if model output is thin)
    const anchorStatePatch: any = {};
    if (anchor?.kind === "trip" && anchor?.trip?.slug) {
      anchorStatePatch.activeTripSlug = anchor.trip.slug;
      anchorStatePatch.activeTripName = anchor.trip.name ?? null;
      anchorStatePatch.activeState = null;
    } else if (anchor?.kind === "state" && anchor?.state) {
      anchorStatePatch.activeState = String(anchor.state).toUpperCase();
      // do not wipe activeTripSlug automatically; user may be asking state-wide while in a trip
    }

    const placePhrase = extractPossiblePlacePhrase(content);
    const anchoredTrip = anchor?.kind === "trip" && anchor?.trip?.slug;

    if (!anchoredTrip && placePhrase && roomState?.activeTripName) {
      // If the user references a different place than the active trip name,
      // and we couldn't resolve it, clear active trip to avoid wrong carryover.
      const a = String(roomState.activeTripName).toLowerCase();
      const b = String(placePhrase).toLowerCase();

      const clearlyDifferent = a && b && !a.includes(b) && !b.includes(a);

      if (clearlyDifferent) {
        anchorStatePatch.activeTripSlug = null;
        anchorStatePatch.activeTripName = null;
      }
    }

    // If we already have an active trip, prefer it unless the user explicitly anchored a different trip
    const effectiveTripSlug: string | null =
      anchorStatePatch.activeTripSlug || roomState?.activeTripSlug || null;

    let tripDetail: any = null;
    if (effectiveTripSlug) {
      try {
        tripDetail = await withTimeout(getTripDetailBySlug(effectiveTripSlug), 9000, "getTripDetailBySlug");
      } catch (e: any) {
        console.warn("Trip detail fetch failed:", e?.message ?? e);
        tripDetail = null;
      }
    }

    // 8) Public info enrichment (only when asked)
    const needPublic = detectPublicInfoNeed(content);
    let publicInfo: any = null;
    if (needPublic.airportsOrDrive) {
      try {
        publicInfo = await fetchPublicInfo(originUrl, content);
      } catch (e: any) {
        console.warn("public_info failed:", e?.message ?? e);
        publicInfo = null;
      }
    }

    // 8.5) Golf detail enrichment (web) — ONLY for approved golf topics, and ONLY after Airtable
    let publicGolfDetails: any = null;
    const needsGolfWeb = detectWebGolfDetailsNeed(content);

    if (needsGolfWeb) {
      try {
        // Only do this if Airtable doesn't already have rich tripDetail / dataDump content
        // (You can tune this rule)
        const airtableHasEnough =
          !!tripDetail?.trip?.dataDump ||
          !!tripDetail?.trip?.fullDescription ||
          (Array.isArray(tripDetail?.courses?.must_play) && tripDetail.courses.must_play.length > 0);

        if (!airtableHasEnough) {
          publicGolfDetails = await fetchPublicGolfDetails(originUrl, content);
        }
      } catch (e: any) {
        console.warn("public_golf_details failed:", e?.message ?? e);
        publicGolfDetails = null;
      }
    }

    // 8.6) Open web enrichment (general fallback) — allowed for most topics now
    let publicWeb: any = null;

    try {
      // Only fall back to web if Airtable is weak
      if (isAirtableWeak(gtiResults as any, tripDetail)) {
        if (isGolfDetailsIntent(content)) {
          // Structured golf-course detail fallback (architect/year/yards/holes/weather/best-month/etc)
          publicGolfDetails = await withTimeout(
            fetchPublicGolfDetails(originUrl, content),
            12000,
            "public_golf_details"
          );
        } else {
          // General web fallback (ChatGPT-style), still filtered by your policy layer in public_web
          publicWeb = await withTimeout(fetchPublicWeb(originUrl, content), 12000, "public_web");
        }
      }
    } catch (e: any) {
      console.warn("web fallback failed:", e?.message ?? e);
      publicGolfDetails = null;
      publicWeb = null;
    }

    // Hard refusal for disallowed categories
    if (isDisallowedTopic(content)) {
      const payload = disallowedTopicReply();

      const assistantInsert = (await withTimeout(
        client.query(
          `insert into public.messages (room_id, kind, content, payload)
          values ($1, 'assistant', $2, $3::jsonb)
          returning *`,
          [roomId, payload.assistantContent, JSON.stringify(payload.assistantPayload)]
        ),
        3000,
        "insert assistant (disallowed)"
      )) as QueryResult<any>;

      return NextResponse.json(
        {
          userMessage,
          assistantMessage: assistantInsert.rows[0],
          state: roomState,
          updated_at: new Date().toISOString(),
        },
        { status: 201 }
      );
    }

    // 9) OpenAI response (SHARED ALGORITHM)
    // IMPORTANT: add this import at the top of the file:
    // import { runCaddieTurnShared } from "@/lib/caddieEngine";

    const out = await withTimeout(
      runCaddieTurnShared({
        content,
        currentState: roomState,
        history, // you already have [{ kind, content }, ...]
        publicInfo,
        publicGolfDetails,
        publicWeb,
        gtiResults,
        anchor,
        tripDetail,
        effectiveTripSlug,
      }),
      15000,
      "openai(shared)"
    );

    let assistantContent = String(out.assistantContent || "").trim();
    let assistantPayload: AssistantPayload =
      out.assistantPayload && typeof out.assistantPayload === "object"
        ? (out.assistantPayload as any)
        : { kind: "info" };

    let statePatch: any =
      out.state_patch && typeof out.state_patch === "object" ? out.state_patch : {};

    if (!assistantContent) assistantContent = "I’m not sure I understood—can you rephrase that?";

    // 10) Merge + persist room_state (anchor patch first, then model patch)
    const nextState = mergeRoomState(roomState, { ...anchorStatePatch, ...statePatch });

    await withTimeout(
      client.query(
        `insert into public.room_state (room_id, state)
        values ($1, $2::jsonb)
        on conflict (room_id) do update
        set state = excluded.state,
            updated_at = now()`,
        [roomId, JSON.stringify(nextState)]
      ),
      3000,
      "save room_state"
    );

    // 11) Insert assistant message
    const assistantInsert = (await withTimeout(
      client.query(
        `insert into public.messages (room_id, kind, content, payload)
        values ($1, 'assistant', $2, $3::jsonb)
        returning *`,
        [
          roomId,
          assistantContent,
          JSON.stringify({
            ...assistantPayload,
            _meta: {
              // shared engine uses openai.responses under the hood; if you want the id,
              // add `openai_response_id` to the engine output and wire it here.
              openai_response_id: null,

              gti_count: Array.isArray(gtiResults) ? gtiResults.length : 0,
              has_trip_detail: !!tripDetail,
              used_public_info: !!publicInfo,

              anchor,
              anchor_state_patch: anchorStatePatch,
              state_patch: statePatch,

              // optional: useful debug fields from the engine
              engine: "shared",
              engine_gti_count: out.gtiResultsCount ?? null,
              engine_trip_detail_used: out.tripDetailUsed ?? null,
            },
          }),
        ]
      ),
      3000,
      "insert assistant"
    )) as QueryResult<any>;

    return NextResponse.json(
      { userMessage, assistantMessage: assistantInsert.rows[0], state: nextState, updated_at: new Date().toISOString() },
      { status: 201 }
    );

  } catch (e: any) {
    console.error("POST /api/rooms/join/[code]/chat failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
