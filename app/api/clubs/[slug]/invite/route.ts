import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import {
  isValidEmail,
  escapeHtml,
  emailShell,
  emailButton,
  sendEmails,
  getClientIp,
  isRateLimited,
  logSend,
} from "@/lib/email";

const RATE_LIMIT = 30; // invite emails per IP per hour

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in to invite members." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    // 404 for a non-member even when the club exists — a 403 would confirm a
    // private club's existence. Same reasoning as the page.
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const viewer = await getClubViewer(club.id, session.user.id, pool);
    if (!canManage(viewer)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const ip = getClientIp(req);
    if (await isRateLimited(pool, ip, RATE_LIMIT)) {
      return NextResponse.json({ error: "Too many invites. Try again later." }, { status: 429 });
    }

    // Seat check and insert must be atomic: two concurrent invites would
    // otherwise both read seats-1 and both commit, overshooting seat_limit. This
    // is the one race in the flow that costs money, so the row is locked for the
    // duration rather than counted optimistically.
    const client = await pool.connect();
    // "invited" = new row, send. "resent" = unclaimed invite already existed,
    // send again. "member" = already on the roster, do NOT send — mailing an
    // active member "join the club" is nonsense. "full" = out of seats.
    let outcome: "invited" | "resent" | "member" | "full";
    try {
      await client.query("BEGIN");
      await client.query(`SELECT 1 FROM clubs WHERE id = $1 FOR UPDATE`, [club.id]);

      const { rows: seatRows } = await client.query(
        `SELECT COUNT(*) FILTER (WHERE status IN ('invited','active'))::int AS used
           FROM club_members WHERE club_id = $1`,
        [club.id]
      );

      // A pending invite holds a seat, so re-inviting someone already on the
      // roster must not consume a second one — hence ON CONFLICT DO NOTHING
      // rather than a blind insert.
      const { rows: inserted } = await client.query(
        `INSERT INTO club_members (club_id, email, role, status)
         VALUES ($1, $2, 'member', 'invited')
         ON CONFLICT (club_id, email) DO NOTHING
         RETURNING 1`,
        [club.id, email]
      );

      if (inserted.length) {
        // Seat check applies only to genuinely new rows; a resend consumes none.
        if (seatRows[0].used >= club.seatLimit) {
          await client.query("ROLLBACK");
          outcome = "full";
        } else {
          await client.query("COMMIT");
          outcome = "invited";
        }
      } else {
        const { rows: existing } = await client.query(
          `SELECT status FROM club_members WHERE club_id = $1 AND email = $2`,
          [club.id, email]
        );
        await client.query("COMMIT");
        outcome = existing[0]?.status === "invited" ? "resent" : "member";
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    if (outcome === "full") {
      return NextResponse.json(
        { error: `All ${club.seatLimit} seats are taken. Upgrade to invite more.` },
        { status: 402 }
      );
    }
    if (outcome === "member") {
      return NextResponse.json({ ok: true, outcome });
    }

    // The row exists now regardless of send outcome — deliberately unlike
    // /api/plan/share/email, where the roster insert rides along with the email
    // and a Resend failure leaves a seat held by an invite nobody received.
    // Here a failed send is reported and the owner can resend against the row.
    const inviter = (session.user.name || "Someone").trim();
    const url = `${SITE_URL}/register?callbackUrl=${encodeURIComponent(
      `/clubs/${club.slug}`
    )}&email=${encodeURIComponent(email)}`;
    const subject = `${inviter} invited you to ${club.name}`;

    const bodyHtml = `
      <h1 style="margin:0 0 8px;font-size:23px;font-weight:800;color:#0b0f1a;line-height:1.25;">${escapeHtml(
        inviter
      )} invited you to ${escapeHtml(club.name)}</h1>
      ${
        club.homeCourse
          ? `<p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#0488db;">${escapeHtml(
              club.homeCourse
            )}</p>`
          : ""
      }
      <p style="margin:0 0 22px;font-size:14px;color:#374151;line-height:1.6;">
        ${escapeHtml(club.name)} plans its golf trips on ${SITE_NAME}. Create an account with this
        email address and you'll land on the club page — vote on where to go, say whether you're in,
        and see the photos afterward.
      </p>
      ${emailButton(url, "Join the club")}`;

    const text = [
      `${inviter} invited you to ${club.name} on ${SITE_NAME}.`,
      ...(club.homeCourse ? [club.homeCourse] : []),
      "",
      `${club.name} plans its golf trips on ${SITE_NAME}. Create an account with this email address and you'll land on the club page.`,
      "",
      `Join here: ${url}`,
    ].join("\n");

    const { sent, ids, errors } = await sendEmails([email], {
      subject,
      html: emailShell({ title: subject, bodyHtml, eyebrow: "Club invite" }),
      text,
    });

    await logSend(pool, ip);

    if (sent === 0) {
      return NextResponse.json(
        {
          // The seat is held regardless; say so, so the owner knows the roster
          // row exists and a resend is the fix rather than re-inviting.
          error: `Seat reserved, but the email didn't send: ${
            errors[0] ?? "unknown error"
          }. Try resending.`,
          outcome,
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, outcome, id: ids[0] });
  } catch (err) {
    console.error("[clubs/invite] error:", err);
    return NextResponse.json({ error: "Failed to send invite." }, { status: 500 });
  }
}
