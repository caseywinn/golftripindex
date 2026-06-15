import { NextResponse } from "next/server";
import { getTripDetailBySlug } from "@/lib/gti";

// Compact trip preview for the bracket's trip modal: headline ratings plus the
// course lineup (must-play + should-play). Backed by the same loader the trip
// page uses, so courses come resolved from Airtable.
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const detail = await getTripDetailBySlug(slug);
    if (!detail) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

    const t = detail.trip as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

    const mapCourse = (c: Record<string, unknown>, tier: string) => ({
      slug: String(c.slug ?? ""),
      name: String(c.name ?? ""),
      architect: typeof c.architect === "string" && c.architect ? c.architect : null,
      ranking: typeof c.consolidatedRanking === "number" ? c.consolidatedRanking : null,
      tier,
    });

    const must = (detail.courses.must_play ?? []) as Record<string, unknown>[];
    const should = (detail.courses.should_play ?? []) as Record<string, unknown>[];
    const courses = [...must.map((c) => mapCourse(c, "must")), ...should.map((c) => mapCourse(c, "should"))]
      .filter((c) => c.slug && c.name);

    return NextResponse.json({
      slug: String(t.slug ?? slug),
      name: String(t.name ?? slug),
      region: typeof t.region === "string" && t.region ? t.region : null,
      costTier: num(t.costTier),
      durationMinDays: num(t.durationMinDays),
      durationMaxDays: num(t.durationMaxDays),
      overallRating: num(t.overallRating),
      golfRating: num(t.golfRating),
      lodgingRating: num(t.lodgingRating),
      foodRating: num(t.foodRating),
      valueRating: num(t.valueRating),
      pullQuote: typeof t.pullQuote === "string" && t.pullQuote ? t.pullQuote : (typeof t.subheader === "string" ? t.subheader : null),
      courses,
    });
  } catch (err) {
    console.error("[trips/preview] error:", err);
    return NextResponse.json({ error: "Couldn't load this trip." }, { status: 500 });
  }
}
