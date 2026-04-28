import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "GolfTripIndex — Ranking America's Best Golf Trips";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0d2318 0%, #1a3a2a 60%, #0d2318 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "60px 80px",
        }}
      >
        <div
          style={{
            color: "#6dbf6d",
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            marginBottom: 32,
          }}
        >
          GolfTripIndex
        </div>
        <div
          style={{
            color: "#ffffff",
            fontSize: 68,
            fontWeight: 700,
            textAlign: "center",
            lineHeight: 1.1,
            maxWidth: 960,
          }}
        >
          Ranking America's Best Golf Trips
        </div>
        <div
          style={{
            color: "#7a9e7a",
            fontSize: 22,
            marginTop: 40,
            letterSpacing: 2,
          }}
        >
          golftripindex.com
        </div>
      </div>
    ),
    { ...size }
  );
}
