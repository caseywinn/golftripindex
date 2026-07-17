import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage, type ClubRole } from "@/lib/clubs";
import { isValidEmail } from "@/lib/email";

type Action = "promote" | "demote" | "suspend" | "reactivate" | "remove" | "revoke";
const ACTIONS: Action[] = ["promote", "demote", "suspend", "reactivate", "remove", "revoke"];

/**
 * Manage an existing roster row: role changes, suspension, removal, and
 * revoking an unclaimed invite.
 *
 * Resending an invite is deliberately NOT here — POST /invite with the same
 * address already returns outcome:"resent" for an unclaimed row.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const action = String(body?.action ?? "") as Action;
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Missing email." }, { status: 400 });
    }
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const viewer = await getClubViewer(club.id, session.user.id, pool);
    // 404, not 403 — don't confirm the club to someone who can't manage it.
    if (!canManage(viewer)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const { rows } = await pool.query(
      `SELECT email, user_id, role, status FROM club_members WHERE club_id = $1 AND email = $2`,
      [club.id, email]
    );
    if (!rows.length) return NextResponse.json({ error: "Not on this roster." }, { status: 404 });
    const target: { user_id: string | null; role: ClubRole; status: string } = rows[0];

    // --- Guards. Order matters: the owner rule outranks everything. ---

    // The owner is structurally load-bearing (clubs.owner_id references them) and
    // demoting or removing them would leave the club unadministered. Ownership
    // has to be transferred first — a feature that doesn't exist yet.
    if (target.role === "owner") {
      return NextResponse.json(
        { error: "The owner can't be changed. Transfer ownership first." },
        { status: 400 }
      );
    }
    // Admins manage members, not each other. Only the owner manages admins,
    // otherwise any admin could strip every other admin.
    if (target.role === "admin" && viewer.role !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can manage admins." },
        { status: 403 }
      );
    }
    // Acting on yourself is how you lock yourself out of your own club.
    if (session.user.email && email === session.user.email.toLowerCase()) {
      return NextResponse.json({ error: "You can't do that to yourself." }, { status: 400 });
    }
    // Role changes are the owner's alone — otherwise an admin could mint admins.
    if ((action === "promote" || action === "demote") && viewer.role !== "owner") {
      return NextResponse.json({ error: "Only the owner can change roles." }, { status: 403 });
    }

    switch (action) {
      case "promote": {
        if (target.status !== "active") {
          return NextResponse.json({ error: "Only active members can be promoted." }, { status: 400 });
        }
        await pool.query(
          `UPDATE club_members SET role = 'admin' WHERE club_id = $1 AND email = $2`,
          [club.id, email]
        );
        return NextResponse.json({ ok: true, outcome: "promoted" });
      }
      case "demote": {
        await pool.query(
          `UPDATE club_members SET role = 'member' WHERE club_id = $1 AND email = $2`,
          [club.id, email]
        );
        return NextResponse.json({ ok: true, outcome: "demoted" });
      }
      case "suspend": {
        // Only active rows: suspending an unclaimed invite would need user_id to
        // be null, and there'd be no way back to 'active' (that CHECK requires a
        // user). Revoke the invite instead.
        if (target.status !== "active") {
          return NextResponse.json({ error: "Only active members can be suspended." }, { status: 400 });
        }
        await pool.query(
          `UPDATE club_members SET status = 'suspended' WHERE club_id = $1 AND email = $2`,
          [club.id, email]
        );
        return NextResponse.json({ ok: true, outcome: "suspended" });
      }
      case "reactivate": {
        if (target.status !== "suspended") {
          return NextResponse.json({ error: "That member isn't suspended." }, { status: 400 });
        }
        // club_members_active_has_user would reject an unbound row. Suspension
        // only ever applies to active (bound) rows, so this is belt-and-braces
        // against a hand-edited row rather than a reachable path.
        if (!target.user_id) {
          return NextResponse.json(
            { error: "That membership has no account attached. Re-invite them." },
            { status: 400 }
          );
        }
        await pool.query(
          `UPDATE club_members SET status = 'active' WHERE club_id = $1 AND email = $2`,
          [club.id, email]
        );
        return NextResponse.json({ ok: true, outcome: "reactivated" });
      }
      case "remove": {
        // Tombstone, not DELETE: user_id is kept so their trip history (RSVPs,
        // attendance, photos) still resolves once those exist. The seat is freed
        // because seats only count 'invited' and 'active'.
        await pool.query(
          `UPDATE club_members SET status = 'removed', role = 'member' WHERE club_id = $1 AND email = $2`,
          [club.id, email]
        );
        return NextResponse.json({ ok: true, outcome: "removed" });
      }
      case "revoke": {
        // An unclaimed invite has no history worth keeping, and deleting frees
        // the seat it was holding and lets the address be re-invited cleanly.
        if (target.status !== "invited") {
          return NextResponse.json({ error: "That invite isn't pending." }, { status: 400 });
        }
        await pool.query(
          `DELETE FROM club_members WHERE club_id = $1 AND email = $2 AND status = 'invited'`,
          [club.id, email]
        );
        return NextResponse.json({ ok: true, outcome: "revoked" });
      }
    }
  } catch (err) {
    console.error("[clubs/members] error:", err);
    return NextResponse.json({ error: "Failed." }, { status: 500 });
  }
}
