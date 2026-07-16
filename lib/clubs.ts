import type pg from "pg";
import { getPgPool } from "@/lib/db";

export type ClubRole = "owner" | "admin" | "member";
export type MemberStatus = "invited" | "requested" | "active" | "suspended" | "removed";

export type Club = {
  id: string;
  name: string;
  slug: string;
  homeCourse: string | null;
  ownerId: string;
  tier: "small" | "large";
  seatLimit: number;
  isPublic: boolean;
};

export type ClubMember = {
  email: string;
  userId: string | null;
  role: ClubRole;
  status: MemberStatus;
  /** users.name once bound; null while the invite is unclaimed. */
  name: string | null;
  invitedAt: Date;
  joinedAt: Date | null;
};

/** Seats consumed. A pending invite holds one — see countSeats. */
export type SeatUsage = { active: number; pending: number; limit: number };

/** The viewer's standing in a club. `null` role = not a member. */
export type ClubViewer = { role: ClubRole | null; status: MemberStatus | null };

export async function getClubBySlug(slug: string, poolArg?: pg.Pool): Promise<Club | null> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT id, name, slug, home_course, owner_id, tier, seat_limit, is_public
       FROM clubs WHERE slug = $1`,
    [slug]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    name: r.name,
    slug: r.slug,
    homeCourse: r.home_course,
    ownerId: String(r.owner_id),
    tier: r.tier,
    seatLimit: r.seat_limit,
    isPublic: r.is_public,
  };
}

/**
 * The viewer's membership, or {role: null} if they aren't on the roster.
 *
 * Callers should treat a null role as "this club does not exist" and 404 — a 403
 * would confirm a private club's existence to a stranger.
 */
export async function getClubViewer(
  clubId: string,
  userId: string | null,
  poolArg?: pg.Pool
): Promise<ClubViewer> {
  if (!userId) return { role: null, status: null };
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT role, status FROM club_members WHERE club_id = $1 AND user_id = $2`,
    [clubId, userId]
  );
  if (!rows.length) return { role: null, status: null };
  return { role: rows[0].role, status: rows[0].status };
}

/**
 * True if the viewer may see the club's contents — roster, trips, everything.
 *
 * Everyone else gets the public stub (name, home course, member count) and a
 * request-to-join button. The stub deliberately withholds the roster: club
 * existence is public by URL, but who is in it is not.
 */
export function canView(v: ClubViewer): boolean {
  // Suspended members keep read access; they just can't act. 'requested',
  // 'removed', and unclaimed invites ('invited' has no user_id, so it never
  // matches getClubViewer's user_id lookup) cannot.
  return v.status === "active" || v.status === "suspended";
}

/** True if the viewer may invite, suspend, remove, or change roles. */
export function canManage(v: ClubViewer): boolean {
  return v.status === "active" && (v.role === "owner" || v.role === "admin");
}

/**
 * Pending join requests, oldest first. Separate from listMembers because these
 * aren't members yet — they hold no seat and appear in their own rail section.
 */
export async function listRequests(clubId: string, poolArg?: pg.Pool): Promise<ClubMember[]> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT m.email, m.user_id, m.role, m.status, m.invited_at, m.joined_at, u.name
       FROM club_members m
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.club_id = $1 AND m.status = 'requested'
      ORDER BY m.invited_at ASC`,
    [clubId]
  );
  return rows.map((r) => ({
    email: r.email,
    userId: r.user_id ? String(r.user_id) : null,
    role: r.role,
    status: r.status,
    name: r.name ?? null,
    invitedAt: r.invited_at,
    joinedAt: r.joined_at,
  }));
}

/** Members shown on the public stub — a count only, never identities. */
export async function countActiveMembers(clubId: string, poolArg?: pg.Pool): Promise<number> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM club_members WHERE club_id = $1 AND status = 'active'`,
    [clubId]
  );
  return rows[0].n;
}

/**
 * Roster in display order: owner and admins first, then by invite time.
 *
 * Joins users for the display name. Unclaimed invites have no users row yet, so
 * `name` is null and the UI must fall back to the email — there is no name to
 * show for someone who hasn't registered.
 *
 * Excludes 'removed' (tombstones kept so trip history still resolves, not roster
 * entries) and 'requested' (not members yet — see listRequests).
 */
export async function listMembers(clubId: string, poolArg?: pg.Pool): Promise<ClubMember[]> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT m.email, m.user_id, m.role, m.status, m.invited_at, m.joined_at, u.name
       FROM club_members m
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.club_id = $1 AND m.status NOT IN ('removed', 'requested')
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
               m.invited_at ASC`,
    [clubId]
  );
  return rows.map((r) => ({
    email: r.email,
    userId: r.user_id ? String(r.user_id) : null,
    role: r.role,
    status: r.status,
    name: r.name ?? null,
    invitedAt: r.invited_at,
    joinedAt: r.joined_at,
  }));
}

/**
 * Seats consumed against the club's limit.
 *
 * A pending invite holds a seat: without that, a club at its limit could invite
 * any number of people and blow past the limit the moment they all accepted.
 * 'suspended' and 'removed' don't consume.
 */
export async function countSeats(
  club: Pick<Club, "id" | "seatLimit">,
  poolArg?: pg.Pool
): Promise<SeatUsage> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'active')::int  AS active,
            COUNT(*) FILTER (WHERE status = 'invited')::int AS pending
       FROM club_members WHERE club_id = $1`,
    [club.id]
  );
  return { active: rows[0].active, pending: rows[0].pending, limit: club.seatLimit };
}
