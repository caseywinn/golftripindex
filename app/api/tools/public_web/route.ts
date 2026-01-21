// app/api/tools/public_web/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "tavily" | "serper" | "bing";

type PublicWebRequest = {
  query?: string;
  maxResults?: number; // default 6
  provider?: Provider; // optional override
  intent?: "general" | "golf" | "travel"; // optional hint
};

type PublicWebResult = {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// -----------------------------
// Restricted-topic guard (same policy as chat)
// -----------------------------
function isRestrictedTopic(text: string) {
  const t = String(text || "").toLowerCase();

  // Medical / mental health
  const medical =
    /\bdiagnos(e|is)\b|\bsymptom(s)?\b|\btreatment\b|\bmedication\b|\bdosage\b|\bprescription\b|\bdoctor\b|\bside effect(s)?\b/.test(t);
  const mentalHealth =
    /\bdepress(ed|ion)\b|\banxiety\b|\bpanic attack\b|\btherapy\b|\btherapist\b|\bbipolar\b|\bschizophren(ia|ic)\b|\bptsd\b/.test(t);

  // Legal
  const legal =
    /\blawyer\b|\battorney\b|\blegal advice\b|\bsue\b|\bliability\b|\bcontract\b|\bsubpoena\b|\bnda\b|\bsettlement\b/.test(t);

  // Financial / crypto
  const financial =
    /\binvest\b|\bstock(s)?\b|\bportfolio\b|\b401k\b|\bira\b|\btaxes?\b|\bloan\b|\bmortgage\b|\binsurance\b|\bretirement\b/.test(t);
  const crypto =
    /\bcrypto\b|\bbitcoin\b|\bethereum\b|\bsolana\b|\bnft\b|\btoken\b|\bairdrop\b|\bwallet\b|\bdefi\b/.test(t);

  // Sex / nudity
  const sexOrNudity = /\bsex\b|\bnude\b|\bnudity\b|\bporn\b|\berotic\b|\bnsfw\b/.test(t);

  // Celebrities / politics (broad)
  const celebrities =
    /\bcelebrity\b|\bactor\b|\bactress\b|\bsinger\b|\brapper\b|\binfluencer\b/.test(t);
  const politics =
    /\belection\b|\bvote\b|\bpolitic(s|al)\b|\bcongress\b|\bsenate\b|\bpresident\b|\bdemocrat\b|\brepublican\b/.test(t);

  // Violence / self-harm / drugs
  const violence =
    /\bkill\b|\bmurder\b|\bassault\b|\bweapon\b|\bgun\b|\bshoot\b|\bstab\b|\bterror\b|\bbomb\b/.test(t);
  const selfHarm = /\bsuicide\b|\bself[-\s]*harm\b|\bkill myself\b|\bend my life\b/.test(t);
  const drugs =
    /\bcocaine\b|\bheroin\b|\bmeth\b|\bfentanyl\b|\bopioid\b|\bweed\b|\bmarijuana\b|\bthc\b|\blsd\b|\bmdma\b/.test(t);

  // Hate / harassment / extremism
  const hateOrHarassment =
    /\bhate\b|\bracist\b|\bnazi\b|\bwhite power\b|\bslur\b|\bharass\b|\bbully\b/.test(t);
  const extremism = /\bisis\b|\bal[-\s]*qaeda\b|\bextremist\b|\bterrorist\b/.test(t);

  // Personal relationship advice
  const relationshipAdvice =
    /\bmy (boyfriend|girlfriend|husband|wife)\b|\bbreak up\b|\bdivorce\b|\bcheating\b|\brelationship advice\b/.test(t);

  // Booking / payment / agent behavior
  const agentBehavior =
    /\bbook\b|\breserve\b|\bpurchase\b|\bbuy\b|\bpay\b|\bpayment\b|\bcredit card\b|\bcheckout\b|\brefund\b/.test(t);

  // Personal data
  const personalData =
    /\bsocial security\b|\bssn\b|\bpassword\b|\bcredit card\b|\baddress\b|\bphone number\b/.test(t);

  return (
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
    personalData
  );
}

// -----------------------------
// Provider selection + calls
// -----------------------------
function pickProvider(explicit?: Provider): Provider {
  if (explicit) return explicit;

  // Prefer Tavily (purpose-built), then Serper, then Bing
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.SERPER_API_KEY) return "serper";
  if (process.env.BING_SEARCH_API_KEY) return "bing";

  // If none set, default to tavily so error message is consistent
  return "tavily";
}

async function searchTavily(query: string, maxResults: number): Promise<PublicWebResult[]> {
  const apiKey = requireEnv("TAVILY_API_KEY");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      // "basic" is fast; use "advanced" if you want more fields later
      search_depth: "basic",
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    }),
  });

  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(json?.message || "Tavily search failed");

  const results = Array.isArray(json?.results) ? json.results : [];
  return results
    .map((r: any) => ({
      title: String(r?.title || "").trim(),
      url: String(r?.url || "").trim(),
      snippet: r?.content ? String(r.content).trim() : undefined,
      source: "tavily",
    }))
    .filter((r: PublicWebResult) => r.title && r.url);
}

async function searchSerper(query: string, maxResults: number): Promise<PublicWebResult[]> {
  const apiKey = requireEnv("SERPER_API_KEY");
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    cache: "no-store",
    body: JSON.stringify({
      q: query,
      num: Math.min(10, Math.max(1, maxResults)),
    }),
  });

  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(json?.message || "Serper search failed");

  const organic = Array.isArray(json?.organic) ? json.organic : [];
  return organic
    .slice(0, maxResults)
    .map((r: any) => ({
      title: String(r?.title || "").trim(),
      url: String(r?.link || "").trim(),
      snippet: r?.snippet ? String(r.snippet).trim() : undefined,
      source: "serper",
    }))
    .filter((r: PublicWebResult) => r.title && r.url);
}

async function searchBing(query: string, maxResults: number): Promise<PublicWebResult[]> {
  const apiKey = requireEnv("BING_SEARCH_API_KEY");
  const endpoint = process.env.BING_SEARCH_ENDPOINT || "https://api.bing.microsoft.com/v7.0/search";

  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(10, Math.max(1, maxResults))));
  url.searchParams.set("mkt", process.env.BING_SEARCH_MARKET || "en-US");
  url.searchParams.set("safeSearch", "Strict");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(json?.error?.message || "Bing search failed");

  const webPages = json?.webPages?.value;
  const items = Array.isArray(webPages) ? webPages : [];
  return items
    .slice(0, maxResults)
    .map((r: any) => ({
      title: String(r?.name || "").trim(),
      url: String(r?.url || "").trim(),
      snippet: r?.snippet ? String(r.snippet).trim() : undefined,
      source: "bing",
    }))
    .filter((r: PublicWebResult) => r.title && r.url);
}

async function runSearch(provider: Provider, query: string, maxResults: number) {
  if (provider === "tavily") return searchTavily(query, maxResults);
  if (provider === "serper") return searchSerper(query, maxResults);
  return searchBing(query, maxResults);
}

// Optional: lightweight query normalization that helps golf/travel questions
function enrichQuery(query: string, intent?: PublicWebRequest["intent"]) {
  const q = String(query || "").trim();
  if (!q) return "";

  if (intent === "golf") {
    // Strong bias towards authoritative course info
    return `${q} golf course architect year opened yardage back tees`;
  }

  if (intent === "travel") {
    return `${q} best time to visit weather season airports drive time`;
  }

  return q;
}

// -----------------------------
// Route
// -----------------------------
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PublicWebRequest;

  const query = String(body?.query || "").trim();
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  if (isRestrictedTopic(query)) {
    return NextResponse.json(
      {
        restricted: true,
        error: "Restricted topic",
        results: [],
      },
      { status: 400 }
    );
  }

  const maxResults = Math.min(10, Math.max(1, Number(body?.maxResults ?? 6)));
  const provider = pickProvider(body?.provider);

  // If provider key missing, surface a precise error
  try {
    // Enrich the query slightly depending on intent (optional)
    const q = enrichQuery(query, body?.intent);

    const results = await runSearch(provider, q, maxResults);

    return NextResponse.json({
      query,
      provider,
      results,
      // Convenience: URLs list for quick citation-building in your model prompt
      urls: results.map((r) => r.url),
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    // Friendly guidance if keys are missing
    const needsKeys =
      msg.includes("TAVILY_API_KEY is not set") ||
      msg.includes("SERPER_API_KEY is not set") ||
      msg.includes("BING_SEARCH_API_KEY is not set");

    return NextResponse.json(
      {
        error: msg,
        provider,
        hint: needsKeys
          ? "Set one of: TAVILY_API_KEY, SERPER_API_KEY, or BING_SEARCH_API_KEY (optionally BING_SEARCH_ENDPOINT)."
          : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  // Simple health-check / quick query for debugging:
  const url = new URL(req.url);
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) return NextResponse.json({ ok: true });

  // Delegate to POST-like behavior
  if (isRestrictedTopic(query)) {
    return NextResponse.json({ restricted: true, error: "Restricted topic", results: [] }, { status: 400 });
  }

  const maxResults = Math.min(10, Math.max(1, Number(url.searchParams.get("n") || 6)));
  const provider = pickProvider((url.searchParams.get("provider") as Provider) || undefined);
  const intent = (url.searchParams.get("intent") as PublicWebRequest["intent"]) || "general";

  try {
    const q = enrichQuery(query, intent);
    const results = await runSearch(provider, q, maxResults);
    return NextResponse.json({ query, provider, results, urls: results.map((r) => r.url) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e), provider }, { status: 500 });
  }
}
