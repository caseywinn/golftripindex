import { ImageResponse } from "next/og";
import { getPublishedTripBySlug } from "@/lib/airtable";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { slug: string } }) {
  const trip = await getPublishedTripBySlug(params.slug);

  const name = trip?.name ?? "Golf Trip";
  const overall = trip?.overallRating ? trip.overallRating.toFixed(1) : null;
  const golf = trip?.golfRating ? Math.floor(trip.golfRating) : null;
  const lodging = trip?.lodgingRating ? Math.floor(trip.lodgingRating) : null;
  const food = trip?.foodRating ? Math.floor(trip.foodRating) : null;
  const vibe = trip?.vibeRating ? Math.floor(trip.vibeRating) : null;

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0d2318 0%, #1a3a2a 60%, #0d2318 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "56px 80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ color: "#6dbf6d", fontSize: 20, letterSpacing: 5, textTransform: "uppercase" }}>
          GolfTripIndex
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 24 }}>
          <div
            style={{
              color: "#ffffff",
              fontSize: name.length > 30 ? 52 : 64,
              fontWeight: 700,
              lineHeight: 1.1,
              maxWidth: 800,
            }}
          >
            {name}
          </div>

          {overall && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ color: "#6dbf6d", fontSize: 80, fontWeight: 700, lineHeight: 1 }}>
                {overall}
              </div>
              <div style={{ color: "#7a9e7a", fontSize: 24 }}>/ 100 overall</div>
            </div>
          )}

          {golf !== null && (
            <div style={{ display: "flex", gap: 40, marginTop: 8 }}>
              {[
                { label: "Golf", val: golf },
                { label: "Lodging", val: lodging },
                { label: "Food", val: food },
                { label: "Vibe", val: vibe },
              ].map(({ label, val }) =>
                val !== null ? (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ color: "#d4e8d4", fontSize: 32, fontWeight: 600 }}>{val}</div>
                    <div style={{ color: "#6a8e6a", fontSize: 16, textTransform: "uppercase", letterSpacing: 2 }}>{label}</div>
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>

        <div style={{ color: "#4a7a4a", fontSize: 18 }}>golftripindex.com</div>
      </div>
    ),
    { ...size }
  );
}
