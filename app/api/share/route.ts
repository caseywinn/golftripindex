import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getPublishedTripBySlug, getPublishedJourneyBySlug } from "@/lib/airtable";
import { formatCostTier, formatDuration } from "@/lib/formatters";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import { getPgPool } from "@/lib/db";

const RATE_LIMIT = 10; // max shares per IP per hour

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.SHARE_FROM_EMAIL || "onboarding@resend.dev";

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function toAbsoluteUrl(url: string | null | undefined, fallback: string): string {
  if (!url) return fallback;
  if (url.startsWith("http")) return url;
  return `${SITE_URL}${url}`;
}

function starRating(score: number): string {
  const filled = Math.round(score / 2); // score is 0–10, map to 0–5
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

export async function POST(req: NextRequest) {
  try {
    const { toEmail, itemType, itemId, itemName, senderName } = await req.json();

    if (!toEmail || !isValidEmail(toEmail)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (!itemType || !itemId || !itemName) {
      return NextResponse.json({ error: "Missing item info." }, { status: 400 });
    }

    // Rate limit by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const pool = getPgPool();
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM share_log
       WHERE ip = $1 AND created_at > now() - interval '1 hour'`,
      [ip]
    );
    if (parseInt(rows[0].cnt, 10) >= RATE_LIMIT) {
      return NextResponse.json({ error: "Too many shares. Try again later." }, { status: 429 });
    }

    const href = `${SITE_URL}/${itemType === "trip" ? "trips" : "journeys"}/${itemId}`;
    const label = itemType === "trip" ? "Golf Trip" : "Golf Journey";
    const from = (senderName ?? "").trim() || "Someone";
    const subject = `${from} is sharing a ${label.toLowerCase()}: ${itemName}`;

    // Fetch rich data for the template
    let imageUrl = `${SITE_URL}/images/${itemType === "trip" ? "trips" : "journeys"}/${itemId}.jpg`;
    let description = "";
    let metaPills: string[] = [];
    let rankingLine = "";

    if (itemType === "trip") {
      try {
        const trip = await getPublishedTripBySlug(itemId);
        if (trip) {
          imageUrl = toAbsoluteUrl(trip.thumbnailImageUrl || trip.heroImageUrl, imageUrl);
          description = trip.seoDescription || trip.subheader || "";
          metaPills = [
            formatDuration(trip.durationMinDays, trip.durationMaxDays),
            formatCostTier(trip.costTier),
          ];
          if (trip.currentRanking) {
            rankingLine = `#${trip.currentRanking} on ${SITE_NAME}`;
          }
        }
      } catch { /* non-fatal */ }
    } else {
      try {
        const journey = await getPublishedJourneyBySlug(itemId);
        if (journey) {
          imageUrl = toAbsoluteUrl(journey.heroImageUrl, imageUrl);
          description = journey.description || "";
          metaPills = [
            formatDuration(journey.durationMinDays, journey.durationMaxDays),
            ...(journey.costTier ? [formatCostTier(journey.costTier)] : []),
          ];
        }
      } catch { /* non-fatal */ }
    }

    const pillsHtml = metaPills
      .map(
        (p) =>
          `<span style="display:inline-block;background:#f0f4f8;color:#444c5c;font-size:12px;font-weight:600;letter-spacing:0.04em;border-radius:6px;padding:4px 10px;margin-right:6px;">${p}</span>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Inter',system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

          <!-- Header -->
          <tr>
            <td style="background:#0b0f1a;padding:18px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <a href="${SITE_URL}" style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;">${SITE_NAME}</a>
                  </td>
                  <td align="right">
                    <span style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;">${label}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Image -->
          <tr>
            <td style="padding:0;line-height:0;">
              <a href="${href}" style="display:block;line-height:0;">
                <img src="${imageUrl}" alt="${itemName}" width="580" style="width:100%;max-width:580px;height:260px;object-fit:cover;display:block;" />
              </a>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 28px;">

              ${rankingLine ? `<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#0488db;">${rankingLine}</p>` : ""}

              <h1 style="margin:0 0 ${description ? "14px" : "20px"};font-size:26px;font-weight:800;color:#0b0f1a;line-height:1.2;letter-spacing:-0.01em;">${itemName}</h1>

              ${description ? `<p style="margin:0 0 20px;font-size:14px;color:#5a6478;line-height:1.65;max-width:48ch;">${description}</p>` : ""}

              ${pillsHtml ? `<div style="margin-bottom:28px;">${pillsHtml}</div>` : ""}

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr><td style="height:1px;background:#e9edf3;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Sender message -->
              <p style="margin:0 0 28px;font-size:14px;color:#7a8499;line-height:1.6;">
                <strong style="color:#0b0f1a;">${from}</strong> thought you'd want to check this out on ${SITE_NAME}.
              </p>

              <!-- CTA -->
              <a href="${href}" style="display:inline-block;background:#0488db;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.02em;text-decoration:none;padding:13px 28px;border-radius:8px;">View ${label} &rarr;</a>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e9edf3;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:11px;color:#a0aab8;line-height:1.5;">
                      Shared via <a href="${SITE_URL}" style="color:#a0aab8;">${SITE_NAME}</a> &mdash; the ranking guide for serious golf trips. No account required to view.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textParts = [
      `${from} is sharing a ${label.toLowerCase()} with you: ${itemName}`,
      "",
      ...(rankingLine ? [rankingLine, ""] : []),
      ...(description ? [description, ""] : []),
      ...(metaPills.length ? [metaPills.join("  ·  "), ""] : []),
      `View it here: ${href}`,
      "",
      "---",
      `Shared via ${SITE_NAME} — the ranking guide for serious golf trips.`,
      SITE_URL,
    ];
    const text = textParts.join("\n");

    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject,
      html,
      text,
    });

    await pool.query(`INSERT INTO share_log (ip) VALUES ($1)`, [ip]);
    // Prune rows older than 24 hours to keep the table small
    pool.query(`DELETE FROM share_log WHERE created_at < now() - interval '24 hours'`).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("share email error:", err);
    return NextResponse.json({ error: "Failed to send." }, { status: 500 });
  }
}
