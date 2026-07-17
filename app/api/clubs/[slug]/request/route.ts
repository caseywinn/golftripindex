import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug } from "@/lib/clubs";

/**
 * Ask to join a club. Any logged-in user may request from the club's URL.
 *
 * A request holds NO seat — the club hasn't agreed to anything yet. The seat is
 * checked and consumed on approval instead. That's why there's no seat gate here.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Sign in to request membership." }, { status: 401 });
    }

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const email = session.user.email.toLowerCase();
    const userId = session.user.id;

    // Insert the request, or reconcile with whatever row already exists for this
    // address. The PK is (club_id, email), so every case below is a conflict on
    // a row that means something different.
    const { rows: inserted } = await pool.query(
      `INSERT INTO club_members (club_id, email, user_id, role, status)
       VALUES ($1, $2, $3, 'member', 'requested')
       ON CONFLICT (club_id, email) DO NOTHING
       RETURNING 1`,
      [club.id, email, userId]
    );
    if (inserted.length) return NextResponse.json({ ok: true, outcome: "requested" });

    const { rows } = await pool.query(
      `SELECT status FROM club_members WHERE club_id = $1 AND email = $2`,
      [club.id, email]
    );
    const status = rows[0]?.status;

    if (status === "active") return NextResponse.json({ ok: true, outcome: "member" });
    if (status === "requested") return NextResponse.json({ ok: true, outcome: "pending" });

    // Suspended members can't request their way back in — that's the owner's
    // call to reverse, otherwise suspension means nothing.
    if (status === "suspended") {
      return NextResponse.json(
        { error: "Your membership is suspended. Contact a club admin." },
        { status: 403 }
      );
    }

    // An unclaimed invite already exists for this address, and the requester is
    // that person: honour the invite rather than making them wait for approval.
    // The club already decided they're welcome. (Normally the bind on sign-in
    // catches this first; this covers an invite sent after they logged in.)
    if (status === "invited") {
      await pool.query(
        `UPDATE club_members SET user_id = $1, status = 'active', joined_at = now()
          WHERE club_id = $2 AND email = $3 AND user_id IS NULL AND status = 'invited'`,
        [userId, club.id, email]
      );
      return NextResponse.json({ ok: true, outcome: "joined" });
    }

    // Previously removed. Let them ask again — rejection isn't a permanent ban.
    if (status === "removed") {
      await pool.query(
        `UPDATE club_members SET user_id = $1, status = 'requested', role = 'member', joined_at = NULL
          WHERE club_id = $2 AND email = $3`,
        [userId, club.id, email]
      );
      return NextResponse.json({ ok: true, outcome: "requested" });
    }

    return NextResponse.json({ error: "Couldn't request membership." }, { status: 400 });
  } catch (err) {
    console.error("[clubs/request] error:", err);
    return NextResponse.json({ error: "Couldn't request membership." }, { status: 500 });
  }
}
