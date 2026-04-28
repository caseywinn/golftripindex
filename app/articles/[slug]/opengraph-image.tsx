import { ImageResponse } from "next/og";
import Airtable from "airtable";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function getArticleForOg(slug: string) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return null;

  Airtable.configure({ apiKey });
  const base = Airtable.base(baseId);
  const records = await base("Articles")
    .select({
      maxRecords: 1,
      filterByFormula: `AND({Status}="published",{Slug}="${slug}")`,
      fields: ["Name", "Teaser", "Author", "Published On"],
    })
    .all();

  const r = records[0];
  if (!r) return null;

  return {
    name: String(r.fields["Name"] ?? ""),
    teaser: r.fields["Teaser"] ? String(r.fields["Teaser"]) : null,
    author: r.fields["Author"] ? String(r.fields["Author"]) : null,
    publishedOn: r.fields["Published On"] ? String(r.fields["Published On"]) : null,
  };
}

export default async function Image({ params }: { params: { slug: string } }) {
  const article = await getArticleForOg(params.slug);

  const title = article?.name ?? "Golf Article";
  const teaser = article?.teaser ?? null;
  const author = article?.author ?? null;

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

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20 }}>
          <div
            style={{
              color: "#ffffff",
              fontSize: title.length > 50 ? 44 : title.length > 30 ? 52 : 60,
              fontWeight: 700,
              lineHeight: 1.15,
              maxWidth: 960,
            }}
          >
            {title}
          </div>

          {teaser && (
            <div
              style={{
                color: "#a8c8a8",
                fontSize: 24,
                lineHeight: 1.4,
                maxWidth: 880,
              }}
            >
              {teaser.length > 120 ? teaser.slice(0, 120) + "…" : teaser}
            </div>
          )}

          {author && (
            <div style={{ color: "#6a8e6a", fontSize: 20, marginTop: 8 }}>
              By {author}
            </div>
          )}
        </div>

        <div style={{ color: "#4a7a4a", fontSize: 18 }}>golftripindex.com</div>
      </div>
    ),
    { ...size }
  );
}
