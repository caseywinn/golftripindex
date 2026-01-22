import { NextResponse } from "next/server";
import { getTripDetailBySlug, gtiSearch } from "@/lib/gti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CourseMini = {
  slug?: string;
  name?: string;
  consolidatedRanking?: number | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = String(url.searchParams.get("slug") || "").trim();

  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "Missing required query param: ?slug=" },
      { status: 400 }
    );
  }

  // 1) Pull trip detail through the exact production function
  const tripDetail = await getTripDetailBySlug(slug).catch((e: any) => {
    return { __error: String(e?.message || e) } as any;
  });

  if (!tripDetail || (tripDetail as any).__error) {
    return NextResponse.json(
      {
        ok: false,
        slug,
        error: (tripDetail as any)?.__error || "Trip detail returned null",
      },
      { status: 500 }
    );
  }

  const buckets = (tripDetail as any).courses || {};
  const must = Array.isArray(buckets.must_play) ? buckets.must_play : [];
  const should = Array.isArray(buckets.should_play) ? buckets.should_play : [];
  const want = Array.isArray(buckets.want_more) ? buckets.want_more : [];
  const unk = Array.isArray(buckets.unknown) ? buckets.unknown : [];

  const all = [...must, ...should, ...want, ...unk];

  const ranked = all.filter(
    (c: any) =>
      typeof c?.consolidatedRanking === "number" &&
      Number.isFinite(c.consolidatedRanking)
  );

  const top100 = ranked.filter((c: any) => c.consolidatedRanking <= 100);

  const sampleCourses = (arr: any[]): CourseMini[] =>
    arr.slice(0, 15).map((c: any) => ({
      slug: c?.slug ? String(c.slug) : undefined,
      name: c?.name ? String(c.name) : undefined,
      consolidatedRanking:
        typeof c?.consolidatedRanking === "number" ? c.consolidatedRanking : null,
    }));

  // 2) Also run a search pass so we can see if the trip is discoverable
  // (Useful if slug mismatch is the real issue.)
  const searchHits = await gtiSearch(slug.replace(/-/g, " ")).catch(() => []);
  const tripHits = (Array.isArray(searchHits) ? searchHits : [])
    .filter((h: any) => String(h?.kind || "").toLowerCase() === "trip")
    .slice(0, 5)
    .map((h: any) => ({
      kind: h.kind,
      tripSlug: h.tripSlug || h?.trip?.slug || h?.slug,
      tripName: h.tripName || h?.trip?.name || h?.name,
    }));

  return NextResponse.json({
    ok: true,
    slug,
    trip: {
      id: (tripDetail as any)?.trip?.id,
      slug: (tripDetail as any)?.trip?.slug,
      name: (tripDetail as any)?.trip?.name,
    },
    counts: {
      must_play: must.length,
      should_play: should.length,
      want_more: want.length,
      unknown: unk.length,
      all: all.length,
      ranked: ranked.length,
      top100: top100.length,
    },
    samples: {
      must_play: sampleCourses(must),
      should_play: sampleCourses(should),
      want_more: sampleCourses(want),
      unknown: sampleCourses(unk),
    },
    tripHits,
  });
}
