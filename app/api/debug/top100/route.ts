import { NextResponse } from "next/server";
import { getTripDetailBySlug } from "@/lib/gti";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim();

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing ?slug=" }, { status: 400 });
  }

  try {
    const d: any = await getTripDetailBySlug(slug);

    if (!d) {
      return NextResponse.json({ ok: false, slug, found: false }, { status: 404 });
    }

    const buckets = d?.courses || {};
    const all = [
      ...(Array.isArray(buckets.must_play) ? buckets.must_play : []),
      ...(Array.isArray(buckets.should_play) ? buckets.should_play : []),
      ...(Array.isArray(buckets.want_more) ? buckets.want_more : []),
      ...(Array.isArray(buckets.unknown) ? buckets.unknown : []),
    ];

    const ranked = all.filter((c: any) => typeof c?.consolidatedRanking === "number");
    const top100 = ranked.filter((c: any) => c.consolidatedRanking > 0 && c.consolidatedRanking <= 100);

    return NextResponse.json({
      ok: true,
      slug,
      trip: d.trip,
      counts: {
        must_play: (buckets.must_play || []).length,
        should_play: (buckets.should_play || []).length,
        want_more: (buckets.want_more || []).length,
        unknown: (buckets.unknown || []).length,
        all: all.length,
        ranked: ranked.length,
        top100: top100.length,
      },
      rankedPreview: ranked
        .slice()
        .sort((a: any, b: any) => a.consolidatedRanking - b.consolidatedRanking)
        .slice(0, 50)
        .map((c: any) => ({
          name: c.name,
          slug: c.slug,
          consolidatedRanking: c.consolidatedRanking,
        })),
      noRankPreview: all
        .filter((c: any) => typeof c?.consolidatedRanking !== "number")
        .slice(0, 50)
        .map((c: any) => ({
          name: c.name,
          slug: c.slug,
          consolidatedRanking: c.consolidatedRanking,
          type: typeof c?.consolidatedRanking,
        })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, slug, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
