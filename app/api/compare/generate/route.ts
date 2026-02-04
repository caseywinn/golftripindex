import { NextResponse } from "next/server";
import { generateHeadToHead } from "../../../../lib/compare/generateHeadToHead";
import { getCompareCache, upsertCompareCache } from "../../../../lib/compare/compareCacheDb";
import { rateLimitPerMinute } from "../../../../lib/compare/rateLimitDb";

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  return "unknown";
}

export async function POST(req: Request) {
  const body = await req.json();
  const pack = body?.pack;

  if (!pack?.tripA?.slug || !pack?.tripB?.slug || !pack?.data_version) {
    return NextResponse.json({ error: "Missing pack" }, { status: 400 });
  }

  const ip = getClientIp(req);
  const rl = await rateLimitPerMinute(ip, 5); // 5 per minute
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const cacheKey = `compare:${pack.tripA.slug}:${pack.tripB.slug}:${pack.data_version}`;

  // 1) Cache lookup
  const cached = await getCompareCache(cacheKey);
  if (cached) {
    return NextResponse.json({ cacheKey, output: cached, cached: true });
  }

  // 2) Generate
  try {
    const result = await generateHeadToHead(pack);

    // Guardrail: basic sanity checks
    if (
      !result.article_markdown.includes("## The Golf") ||
      !result.article_markdown.includes("## The Verdict") ||
      !result.article_markdown.includes("Winner:")
    ) {
      throw new Error("Generated article missing expected headings/Winner lines.");
    }

    const output = {
      teaser: result.teaser,
      article_markdown: result.article_markdown,
      facts_sidebar: result.facts_sidebar,
    };

    // 3) Write cache (30 days)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await upsertCompareCache({
      cacheKey,
      tripASlug: pack.tripA.slug,
      tripBSlug: pack.tripB.slug,
      dataVersion: pack.data_version,
      expiresAt,
      output,
    });

    console.log("COMPARE cacheKey:", cacheKey);

    const cached = await getCompareCache(cacheKey);
    console.log("COMPARE cache hit:", Boolean(cached));

    if (cached) console.log("COMPARE served from cache");
    else console.log("COMPARE cache miss; generating");

    return NextResponse.json({ cacheKey, output, cached: false });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Generation failed" },
      { status: 500 }
    );
  }
}
