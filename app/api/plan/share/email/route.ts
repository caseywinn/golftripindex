import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import { formatTripWhen } from "@/lib/planWhen";

const RATE_LIMIT = 20; // max share emails per IP per hour
const MAX_RECIPIENTS = 15;
const FROM = process.env.SHARE_FROM_EMAIL || "onboarding@resend.dev";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function dollars(n: number | null | undefined): string {
  if (!n || n < 1) return "";
  return "$".repeat(Math.min(5, Math.max(1, n)));
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

type Dest = { slug: string; name: string; overallRating?: number | null; costTier?: number | null };

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in to share a trip." }, { status: 401 });
    }

    const { id, toEmails, message } = await req.json();
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing trip id." }, { status: 400 });
    }

    const recipients: string[] = (Array.isArray(toEmails) ? toEmails : [])
      .map((e: unknown) => String(e).trim())
      .filter(Boolean);
    const invalid = recipients.filter((e) => !isValidEmail(e));
    if (recipients.length === 0) {
      return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });
    }
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Invalid email: ${invalid[0]}` }, { status: 400 });
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Up to ${MAX_RECIPIENTS} recipients at a time.` }, { status: 400 });
    }

    const pool = getPgPool();

    // Owner check + load the saved plan.
    const { rows } = await pool.query(
      `SELECT user_id, state FROM shared_trips WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }
    if (rows[0].user_id !== session.user.id) {
      return NextResponse.json({ error: "Not your trip to share." }, { status: 403 });
    }
    const state = rows[0].state as {
      destinations?: Dest[]; golfers?: number | null; nights?: number | null; when?: unknown;
      vote?: { type?: string } | null;
    };

    // When this share is a group vote, everyone emailed becomes part of the
    // closed roster (the denominator for auto-close). Idempotent on re-send.
    if (state?.vote?.type) {
      await Promise.all(
        recipients.map((to) =>
          pool.query(
            `INSERT INTO trip_poll_voters (shared_trip_id, email)
             VALUES ($1, $2)
             ON CONFLICT (shared_trip_id, email) DO NOTHING`,
            [id, to.toLowerCase()]
          )
        )
      );
    }

    // Rate limit by IP.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rl = await pool.query(
      `SELECT COUNT(*) AS cnt FROM share_log WHERE ip = $1 AND created_at > now() - interval '1 hour'`,
      [ip]
    );
    if (parseInt(rl.rows[0].cnt, 10) >= RATE_LIMIT) {
      return NextResponse.json({ error: "Too many shares. Try again later." }, { status: 429 });
    }

    const url = `${SITE_URL}/plan/shared/${id}`;
    const sender = (session.user.name || "Someone").trim();
    const dests = Array.isArray(state.destinations) ? state.destinations : [];
    const whenStr = formatTripWhen(state.when as never, state.nights ?? 0);
    const subject = `${sender} shared a golf trip with you`;

    const metaBits = [
      state.golfers ? `${state.golfers} golfer${state.golfers === 1 ? "" : "s"}` : "",
      state.nights ? `${state.nights} night${state.nights === 1 ? "" : "s"}` : "",
      whenStr,
    ].filter(Boolean);

    const destRows = dests
      .map((d) => {
        const meta = [dollars(d.costTier), d.overallRating != null ? Number(d.overallRating).toFixed(2) : ""]
          .filter(Boolean)
          .join("&nbsp;·&nbsp;");
        return `<tr><td style="padding:10px 0;border-bottom:1px solid #eef1f6;">
          <div style="font-size:15px;font-weight:700;color:#0b0f1a;">${escapeHtml(d.name)}</div>
          ${meta ? `<div style="font-size:12px;color:#9aa3b2;margin-top:2px;">${meta}</div>` : ""}
        </td></tr>`;
      })
      .join("");

    const customMsg = (message ? String(message).trim() : "").slice(0, 1000);

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Inter',system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
      <tr><td style="background:#0b0f1a;padding:18px 32px;">
        <a href="${SITE_URL}" style="color:#fff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;">${SITE_NAME}</a>
      </td></tr>
      <tr><td style="padding:30px 32px 26px;">
        <h1 style="margin:0 0 8px;font-size:23px;font-weight:800;color:#0b0f1a;line-height:1.25;">${escapeHtml(sender)} shared a golf trip with you</h1>
        ${metaBits.length ? `<p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#0488db;">${metaBits.map(escapeHtml).join("&nbsp;·&nbsp;")}</p>` : ""}
        ${customMsg ? `<p style="margin:0 0 22px;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${escapeHtml(customMsg)}</p>` : ""}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px;">${destRows}</table>
        <a href="${url}" style="display:inline-block;background:#0488db;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:8px;">View the trip &rarr;</a>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e9edf3;">
        <p style="margin:0;font-size:11px;color:#a0aab8;line-height:1.5;">Shared via <a href="${SITE_URL}" style="color:#a0aab8;">${SITE_NAME}</a> — no account required to view.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

    const textLines = [
      `${sender} shared a golf trip with you on ${SITE_NAME}.`,
      "",
      ...(metaBits.length ? [metaBits.join("  ·  "), ""] : []),
      ...(customMsg ? [customMsg, ""] : []),
      ...dests.map((d) => `• ${d.name}`),
      "",
      `View the trip: ${url}`,
    ];
    const text = textLines.join("\n");

    const resend = getResend();
    // Send individually so recipients don't see each other.
    const results = await Promise.allSettled(
      recipients.map((to) => resend.emails.send({ from: FROM, to, subject, html, text }))
    );
    const sent = results.filter((r) => r.status === "fulfilled").length;

    await pool.query(`INSERT INTO share_log (ip) VALUES ($1)`, [ip]);

    if (sent === 0) {
      return NextResponse.json({ error: "Could not send. Try again." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[plan/share/email] error:", err);
    return NextResponse.json({ error: "Failed to send." }, { status: 500 });
  }
}
