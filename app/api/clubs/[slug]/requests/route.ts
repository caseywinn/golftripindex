import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import { isValidEmail } from "@/lib/email";

/**
 * Approve or reject a pending join request.
 *
 * Approval is where a request finally consumes a seat, so the seat check lives
 * here and has to be atomic — two admins approving at once would otherwise both
 * read seats-1 and both commit, overshooting seat_limit.
 *
 * Rejection deletes the row rather than tombstoning it. A tombstone is only
 * needed to keep trip history resolvable, and a rejected request has no history.
 * Deleting also lets someone ask again later — a rejection is a "not now", not a
 * ban. The tradeoff is that nothing stops repeated requests; if that becomes
 * abuse, a 'rejected' status would block re-requests at the cost of giving the
 * requester no way back.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const action = String(body?.action ?? "");
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Missing email." }, { status: 400 });
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const viewer = await getClubViewer(club.id, session.user.id, pool);
    // 404 rather than 403 — don't confirm the club to someone who can't manage it.
    if (!canManage(viewer)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (action === "reject") {
      const { rowCount } = await pool.query(
        `DELETE FROM club_members WHERE club_id = $1 AND email = $2 AND status = 'requested'`,
        [club.id, email]
      );
      if (!rowCount) return NextResponse.json({ error: "No pending request." }, { status: 404 });
      return NextResponse.json({ ok: true, outcome: "rejected" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT 1 FROM clubs WHERE id = $1 FOR UPDATE`, [club.id]);

      const { rows: seatRows } = await client.query(
        `SELECT COUNT(*) FILTER (WHERE status IN ('invited','active'))::int AS used
           FROM club_members WHERE club_id = $1`,
        [club.id]
      );
      if (seatRows[0].used >= club.seatLimit) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `All ${club.seatLimit} seats are taken. Upgrade to approve more.` },
          { status: 402 }
        );
      }

      // user_id is already set (club_members_requested_bound guarantees it), so
      // this satisfies club_members_active_has_user.
      const { rowCount } = await client.query(
        `UPDATE club_members SET status = 'active', joined_at = now()
          WHERE club_id = $1 AND email = $2 AND status = 'requested'`,
        [club.id, email]
      );
      if (!rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "No pending request." }, { status: 404 });
      }
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, outcome: "approved" });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[clubs/requests] error:", err);
    return NextResponse.json({ error: "Failed." }, { status: 500 });
  }
}
