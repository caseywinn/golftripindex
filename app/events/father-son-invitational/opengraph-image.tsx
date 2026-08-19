import { ImageResponse } from "next/og";

/**
 * Route-level OG card. This page gets pasted into outreach email to resort
 * group-sales contacts; the site-wide card ("Ranking America's Best Golf
 * Trips") tells them nothing about what they've been sent.
 */
export const runtime = "edge";
export const alt =
  "GTI Father-Son Invitational — a three-day golf trip for dads and kids new to playing golf";
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
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            color: "#6dbf6d",
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          GolfTripIndex
        </div>
        <div
          style={{
            color: "#ffffff",
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.08,
            maxWidth: 900,
          }}
        >
          Father-Son Invitational
        </div>
        <div
          style={{
            color: "#c7dcc7",
            fontSize: 26,
            lineHeight: 1.45,
            marginTop: 28,
            maxWidth: 860,
          }}
        >
          Three days of golf for dads and kids who are new to playing the game.
        </div>
        <div style={{ color: "#7a9e7a", fontSize: 20, marginTop: 40, letterSpacing: 2 }}>
          Applications open · Location and dates to be announced
        </div>
      </div>
    ),
    { ...size }
  );
}
