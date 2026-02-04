import { NextResponse } from "next/server";
import { buildComparisonPack } from "../../../lib/compare/buildComparisonPack";
import { generateHeadToHead } from "../../../lib/compare/generateHeadToHead";
import { getCompareCache, upsertCompareCache } from "../../../lib/compare/compareCacheDb";
import { rateLimitPerMinute } from "../../../lib/compare/rateLimitDb";

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  return "unknown";
}

type CompareBody = {
  A: string;
  B: string;
  bypassCache?: boolean;
};

export async function POST(req: Request) {
  const t0 = Date.now(); // ⏱ TOTAL TIMER

  const body = (await req.json()) as CompareBody;

  const slugA = (body?.A || "").trim();
  const slugB = (body?.B || "").trim();
  const bypassCache = Boolean(body?.bypassCache);

  if (!slugA || !slugB) {
    return NextResponse.json({ error: "Missing A or B" }, { status: 400 });
  }
  if (slugA === slugB) {
    return NextResponse.json({ error: "Pick two different trips" }, { status: 400 });
  }

  // Rate limit
  const ip = getClientIp(req);
  const tRate0 = Date.now();
  const rl = await rateLimitPerMinute(ip, 5);
  console.log("TIMING rate-limit ms", Date.now() - tRate0);

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  // 1) Build pack (Airtable)
  const tPack0 = Date.now();
  const pack = await buildComparisonPack(slugA, slugB);
  console.log("TIMING build-pack ms", Date.now() - tPack0);

  if (!pack) {
    return NextResponse.json({ error: "Trips not found" }, { status: 404 });
  }

  const cacheKey = `compare:${pack.tripA.slug}:${pack.tripB.slug}:${pack.data_version}`;

  // 2) Cache read
  if (!bypassCache) {
    const tCacheRead0 = Date.now();
    const cached = await getCompareCache(cacheKey);
    console.log("TIMING cache-read ms", Date.now() - tCacheRead0);

    if (cached) {
      console.log("TIMING total ms (cached)", Date.now() - t0);
      return NextResponse.json({
        cacheKey,
        cached: true,
        pack_meta: {
          generated_at: pack.generated_at,
          data_version: pack.data_version,
          tripA: { name: pack.tripA.name, slug: pack.tripA.slug },
          tripB: { name: pack.tripB.name, slug: pack.tripB.slug },
        },
        output: cached,
      });
    }
  }

  // 3) Generate (OpenAI)
  try {
    const tGen0 = Date.now();
    const result = await generateHeadToHead(pack);
    console.log("TIMING generate ms", Date.now() - tGen0);

    const output = {
      teaser: result.teaser,
      article_markdown: result.article_markdown,
      facts_sidebar: result.facts_sidebar,
    };

    // 4) Cache write
    const tCacheWrite0 = Date.now();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await upsertCompareCache({
      cacheKey,
      tripASlug: pack.tripA.slug,
      tripBSlug: pack.tripB.slug,
      dataVersion: pack.data_version,
      expiresAt,
      output,
    });
    console.log("TIMING cache-write ms", Date.now() - tCacheWrite0);

    console.log("TIMING total ms (generated)", Date.now() - t0);

    return NextResponse.json({
      cacheKey,
      cached: false,
      pack_meta: {
        generated_at: pack.generated_at,
        data_version: pack.data_version,
        tripA: { name: pack.tripA.name, slug: pack.tripA.slug },
        tripB: { name: pack.tripB.name, slug: pack.tripB.slug },
      },
      output,
    });
  } catch (e: any) {
    console.log("TIMING total ms (error)", Date.now() - t0);
    return NextResponse.json({ error: e?.message || "Compare failed" }, { status: 500 });
  }
}
