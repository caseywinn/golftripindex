import { NextResponse } from "next/server";

export const runtime = "nodejs";

function requireKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  return key;
}

type PublicInfoRequest = {
  origin?: string; // e.g. "Chicago, IL"
  destination?: string; // e.g. "Sand Valley Golf Resort, Nekoosa, WI"
  near?: string; // alternative: just "Sand Valley, WI"
  mode?: "drive";
  includeAirports?: boolean;
  includeGolfAlongRoute?: boolean;
  maxStops?: number; // default 6
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

async function fetchJson(url: string, label: string) {
  const res = await withTimeout(fetch(url, { method: "GET", cache: "no-store" }), 6000, label);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error_message || `Google API error (${res.status})`);
  return json;
}

async function geocode(place: string) {
  const key = requireKey();
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json" +
    `?address=${encodeURIComponent(place)}` +
    `&key=${encodeURIComponent(key)}`;
  const json = await fetchJson(url, "geocode");
  const loc = json?.results?.[0]?.geometry?.location;
  if (!loc) throw new Error(`Could not geocode: ${place}`);
  return {
    lat: loc.lat as number,
    lng: loc.lng as number,
    formatted: json.results[0].formatted_address as string,
  };
}

async function distanceMatrix(origin: string, destination: string) {
  const key = requireKey();
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json" +
    `?origins=${encodeURIComponent(origin)}` +
    `&destinations=${encodeURIComponent(destination)}` +
    `&mode=driving` +
    `&units=imperial` +
    `&key=${encodeURIComponent(key)}`;

  const json = await fetchJson(url, "distanceMatrix");
  const el = json?.rows?.[0]?.elements?.[0];
  if (!el || el.status !== "OK") throw new Error("Distance Matrix returned no route");
  return {
    distanceText: el.distance?.text as string | undefined,
    durationText: el.duration?.text as string | undefined,
  };
}

async function findNearbyAirports(lat: number, lng: number, maxResults = 5) {
  const key = requireKey();
  const url =
    "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
    `?location=${lat},${lng}` +
    `&radius=150000` +
    `&keyword=${encodeURIComponent("airport")}` +
    `&key=${encodeURIComponent(key)}`;

  const json = await fetchJson(url, "nearbyAirports");
  const results = (json?.results ?? []) as any[];

  const scored = results
    .map((r) => {
      const name = String(r?.name ?? "");
      const score =
        (/\binternational\b/i.test(name) ? 3 : 0) +
        (/\bregional\b/i.test(name) ? 1 : 0) +
        (/\bairport\b/i.test(name) ? 1 : 0);
      return {
        name,
        placeId: r.place_id,
        rating: r.rating,
        userRatingsTotal: r.user_ratings_total,
        location: r.geometry?.location,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored;
}

async function findGolfStopsApprox(
  originLoc: { lat: number; lng: number },
  destLoc: { lat: number; lng: number },
  maxStops = 6
) {
  const key = requireKey();

  const mid = {
    lat: (originLoc.lat + destLoc.lat) / 2,
    lng: (originLoc.lng + destLoc.lng) / 2,
  };

  const queries = [
    { lat: mid.lat, lng: mid.lng, radius: 70000 },
    { lat: destLoc.lat, lng: destLoc.lng, radius: 70000 },
  ];

  const all: any[] = [];

  for (const q of queries) {
    const url =
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
      `?location=${q.lat},${q.lng}` +
      `&radius=${q.radius}` +
      `&type=${encodeURIComponent("golf_course")}` +
      `&key=${encodeURIComponent(key)}`;
    const json = await fetchJson(url, "golfStopsApprox");
    for (const r of (json?.results ?? []) as any[]) {
      all.push({
        name: r.name,
        placeId: r.place_id,
        rating: r.rating,
        userRatingsTotal: r.user_ratings_total,
        vicinity: r.vicinity,
        location: r.geometry?.location,
      });
    }
  }

  const seen = new Set<string>();
  const dedup = all.filter((x) => {
    const id = String(x.placeId || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  dedup.sort(
    (a, b) =>
      (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0) ||
      (b.rating ?? 0) - (a.rating ?? 0)
  );

  return dedup.slice(0, maxStops);
}

/**
 * GET /api/tools/public_info?q=<place>
 * Lightweight enrichment to support chat fallback.
 */
export async function GET(req: Request) {
  try {
    requireKey();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();

    if (!q) {
      return NextResponse.json({ error: "Missing q" }, { status: 400 });
    }

    // Keep GET intentionally light: resolve a place and optionally airports nearby.
    const place = await geocode(q);

    // Best-effort airports (don’t fail GET if Places is unhappy)
    let airports: any[] = [];
    try {
      airports = await findNearbyAirports(place.lat, place.lng, 5);
    } catch {
      airports = [];
    }

    return NextResponse.json(
      {
        query: q,
        destination: place.formatted,
        location: { lat: place.lat, lng: place.lng },
        airports,
        policy: {
          note: "High-level public info only. Use POST for origin->destination drive and golf-stops enrichment.",
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("GET /api/tools/public_info failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    requireKey();

    const body = (await req.json().catch(() => ({}))) as PublicInfoRequest;

    const origin = body.origin?.trim();
    const destination = body.destination?.trim();
    const near = body.near?.trim();

    const includeAirports = body.includeAirports !== false;
    const includeGolfAlongRoute = body.includeGolfAlongRoute === true;
    const maxStops = Math.max(1, Math.min(body.maxStops ?? 6, 10));

    if (!destination && !near) {
      return NextResponse.json({ error: "Provide destination or near" }, { status: 400 });
    }

    const destPlace = await geocode(destination || near!);
    const originPlace = origin ? await geocode(origin) : null;

    const drive =
      origin && destination ? await distanceMatrix(origin, destination) : null;

    const airports = includeAirports
      ? await findNearbyAirports(destPlace.lat, destPlace.lng, 5)
      : [];

    const golfStops =
      includeGolfAlongRoute && originPlace
        ? await findGolfStopsApprox(originPlace, destPlace, maxStops)
        : [];

    return NextResponse.json(
      {
        destination: destPlace.formatted,
        origin: originPlace?.formatted,
        drive,
        airports,
        golfStops,
        policy: {
          note: "High-level public info only. No flights, rental cars, booking, or itinerary planning returned by this endpoint.",
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("POST /api/tools/public_info failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
