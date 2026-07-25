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

// ── The clubs a user belongs to (My Clubs, on the bag page) ──────────────────

/**
 * A club's current-trip state, for the My Clubs badge:
 *  - "voting"   → a proposal is open for the club to vote on right now
 *  - "planning" → the next trip's destination is decided (won its vote / live)
 *  - null       → nothing in the works
 */
export type ClubTripState = "voting" | "planning" | null;

/** One row of a user's club list. */
export type UserClub = {
  name: string;
  slug: string;
  homeCourse: string | null;
  role: ClubRole;
  tripState: ClubTripState;
};

/**
 * Every club the user can see, owner/admins-first then by name. Mirrors the
 * per-club `canView` predicate: active or suspended memberships list; invited,
 * requested, and removed do not.
 *
 * Each row carries its newest open trip's status so the UI can flag a club that's
 * mid-vote or has a decided next trip. A 'draft' (proposed, not yet a live vote)
 * is intentionally not surfaced — there's nothing for a member to act on yet.
 */
export async function listClubsForUser(userId: string, poolArg?: pg.Pool): Promise<UserClub[]> {
  const pool = poolArg ?? getPgPool();
  const { rows } = await pool.query(
    `SELECT c.name, c.slug, c.home_course, m.role,
            (SELECT t.status FROM club_trips t
              WHERE t.club_id = c.id
                AND t.status IN ('draft', 'voting', 'planning', 'live')
              ORDER BY t.created_at DESC LIMIT 1) AS trip_status
       FROM clubs c
       JOIN club_members m ON m.club_id = c.id
      WHERE m.user_id = $1 AND m.status IN ('active', 'suspended')
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, c.name ASC`,
    [userId]
  );
  return rows.map((r) => ({
    name: r.name,
    slug: r.slug,
    homeCourse: r.home_course ?? null,
    role: r.role,
    tripState:
      r.trip_status === "voting"
        ? "voting"
        : r.trip_status === "planning" || r.trip_status === "live"
          ? "planning"
          : null,
  }));
}

// ── Creating a club ──────────────────────────────────────────────────────────

// Seats granted per tier. Denormalized onto clubs.seat_limit at create time so a
// club can later be granted extra seats without changing its tier (see the
// schema note on seat_limit in migrations/add_clubs.sql).
const TIER_SEATS: Record<Club["tier"], number> = { small: 8, large: 24 };

/** Turn a club name into a URL slug: lowercase, alphanumerics, hyphen-joined. */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type CreateClubResult =
  | { ok: true; slug: string }
  | { ok: false; status: number; error: string };

/**
 * Create a club and seat its creator as the active owner, atomically.
 *
 * NOTE ON BILLING: the schema treats a club as a paid, provisioned object (see
 * migrations/add_clubs.sql — both tiers are paid, there is no free state). This
 * self-serve path deliberately creates one anyway on the 'small' tier; gating it
 * behind payment is a later concern. Until that lands, creating a club hands out
 * the paid product for free.
 */
export async function createClub(
  opts: { ownerId: string; ownerEmail: string; name: string; homeCourse: string | null },
  poolArg?: pg.Pool
): Promise<CreateClubResult> {
  const pool = poolArg ?? getPgPool();
  const name = opts.name.trim();
  if (!name) return { ok: false, status: 400, error: "Give your club a name." };
  const base = slugifyName(name);
  if (!base) {
    return { ok: false, status: 400, error: "That name needs some letters or numbers to make a link." };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // First free slug: base, base-2, base-3, … The UNIQUE(slug) constraint is
    // the real guard against a concurrent creator taking the same slug between
    // this check and the insert; the loop just keeps the common case tidy.
    let slug = base;
    for (let n = 2; n <= 99; n += 1) {
      const { rows } = await client.query(`SELECT 1 FROM clubs WHERE slug = $1`, [slug]);
      if (!rows.length) break;
      slug = `${base}-${n}`;
    }

    const tier: Club["tier"] = "small";
    const { rows: clubRows } = await client.query(
      `INSERT INTO clubs (name, slug, home_course, owner_id, tier, seat_limit)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [name, slug, opts.homeCourse?.trim() || null, opts.ownerId, tier, TIER_SEATS[tier]]
    );
    const clubId = String(clubRows[0].id);

    // Seat the creator as the active owner. status 'active' + a real user_id
    // satisfies club_members_active_has_user; joined_at marks the bind.
    await client.query(
      `INSERT INTO club_members (club_id, email, user_id, role, status, joined_at)
       VALUES ($1, lower($2), $3, 'owner', 'active', now())`,
      [clubId, opts.ownerEmail, opts.ownerId]
    );

    await client.query("COMMIT");
    return { ok: true, slug };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
