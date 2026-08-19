import { ImageResponse } from "next/og";

/**
 * Site-wide social card — the fallback for every page that doesn't define its
 * own opengraph-image. Route segments override it (see
 * app/events/father-son-invitational/opengraph-image.tsx).
 *
 * The previous version was a dark green gradient with a text wordmark set in
 * whatever font Satori defaults to. None of that is GTI: the brand is blue
 * (#0488db) on near-black (#0b0f1a), it has an actual logo, and the site is set
 * in Inter. This card uses all three.
 */
export const runtime = "edge";
export const alt = "Golf Trip Index — ranking America's best golf trips";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  /*
   * Bundled at build time rather than fetched over the network, so rendering a
   * card never depends on an external host being up.
   *
   * Sizes matter here — everything below is inlined into the edge bundle. The
   * background is a purpose-built 1200×630 crop (~99KB) rather than the 956KB
   * homepage hero, and the fonts are latin-subset WOFF at ~30KB each. Satori
   * reads ttf/otf/woff but NOT woff2, so don't "upgrade" these files.
   */
  const [bg, logo, inter400, inter700] = await Promise.all([
    fetch(new URL("../public/images/og/site-card.jpg", import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL("../public/logo-gti-white.png", import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL("../public/fonts/inter-latin-400.woff", import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL("../public/fonts/inter-latin-700.woff", import.meta.url)).then((r) => r.arrayBuffer()),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#0b0f1a",
          fontFamily: "Inter",
        }}
      >
        <img
          src={bg as unknown as string}
          alt=""
          style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }}
        />
        {/* Scrim, heavy on the left so type always has a dark ground under it,
            clearing to almost nothing on the right so the course reads. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            background:
              "linear-gradient(100deg, rgba(11,15,26,0.95) 0%, rgba(11,15,26,0.88) 36%, rgba(11,15,26,0.52) 64%, rgba(11,15,26,0.10) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "60px 68px",
          }}
        >
          <img src={logo as unknown as string} alt="" width={224} height={66} />

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#ffffff",
                fontSize: 62,
                fontWeight: 700,
                lineHeight: 1.04,
                letterSpacing: -1.6,
                maxWidth: 780,
              }}
            >
              Ranking America’s Best Golf Trips
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.76)",
                fontSize: 24,
                lineHeight: 1.4,
                marginTop: 22,
                maxWidth: 800,
              }}
            >
              Independent scores on courses, lodging, food, cost, and vibe.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 36, height: 3, background: "#0488db" }} />
            <div style={{ color: "#8fc9f0", fontSize: 20, letterSpacing: 2 }}>golftripindex.com</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: inter400, weight: 400, style: "normal" },
        { name: "Inter", data: inter700, weight: 700, style: "normal" },
      ],
    }
  );
}
