import { ImageResponse } from "next/og";
import { getPublishedJourneyBySlug } from "@/lib/airtable";
import { formatDuration } from "@/lib/formatters";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { slug: string } }) {
  const journey = await getPublishedJourneyBySlug(params.slug);

  const name = journey?.name ?? "Golf Journey";
  const description = journey?.description ?? null;
  const duration = journey
    ? formatDuration(journey.durationMinDays, journey.durationMaxDays)
    : null;
  const stopCount = journey?.stops?.length ?? null;

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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ color: "#6dbf6d", fontSize: 20, letterSpacing: 5, textTransform: "uppercase" }}>
            GolfTripIndex
          </div>
          <div
            style={{
              background: "#2a5a3a",
              color: "#6dbf6d",
              fontSize: 14,
              letterSpacing: 2,
              textTransform: "uppercase",
              padding: "4px 12px",
              borderRadius: 4,
            }}
          >
            Golf Journey
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20 }}>
          <div
            style={{
              color: "#ffffff",
              fontSize: name.length > 40 ? 48 : 60,
              fontWeight: 700,
              lineHeight: 1.1,
              maxWidth: 960,
            }}
          >
            {name}
          </div>

          {description && (
            <div style={{ color: "#a8c8a8", fontSize: 24, lineHeight: 1.4, maxWidth: 880 }}>
              {description.length > 110 ? description.slice(0, 110) + "…" : description}
            </div>
          )}

          <div style={{ display: "flex", gap: 40, marginTop: 8 }}>
            {duration && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ color: "#d4e8d4", fontSize: 28, fontWeight: 600 }}>{duration}</div>
                <div style={{ color: "#6a8e6a", fontSize: 16, textTransform: "uppercase", letterSpacing: 2 }}>Duration</div>
              </div>
            )}
            {stopCount !== null && stopCount > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ color: "#d4e8d4", fontSize: 28, fontWeight: 600 }}>{stopCount}</div>
                <div style={{ color: "#6a8e6a", fontSize: 16, textTransform: "uppercase", letterSpacing: 2 }}>Stops</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ color: "#4a7a4a", fontSize: 18 }}>golftripindex.com</div>
      </div>
    ),
    { ...size }
  );
}
