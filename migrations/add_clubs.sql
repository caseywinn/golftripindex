-- Clubs: a persistent group entity (the "men's club" B2B tier).
--
-- Everything else in this app is either per-user (user_items) or per-share
-- (shared_trips) — both ephemeral. A club is the first long-lived owner of
-- members and history, and its roster is the billing spine: seats are what a
-- club pays for.
--
-- club_members deliberately mirrors trip_poll_voters: EMAIL is the identity and
-- user_id is a nullable attachment filled in when the invitee logs in. That
-- inversion is what lets you invite someone who has no account yet, and what
-- makes re-inviting idempotent (ON CONFLICT on the PK).
--
-- Deviation from convention, on purpose: user_id here is a real
-- `uuid REFERENCES users(id)`, not the unconstrained TEXT every other table
-- uses. That convention has already produced orphans in this database (a
-- trip_poll_voters captain seat points at a deleted account). On user_items an
-- orphan is a lost wishlist; on a roster that bills per seat, an orphan is a
-- seat charging for a user who does not exist.

CREATE TABLE IF NOT EXISTS clubs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,          -- /clubs/[slug]
  -- Display text ("Wolf Hollow Golf Club — Farmington, PA"), NOT an Airtable
  -- slug. Airtable only carries top-100 ranked courses (getPublishedCourses),
  -- and a men's club's home course usually isn't one of them, so a slug would
  -- fail to resolve for most clubs. If linking to course pages is wanted later,
  -- add a nullable home_course_slug alongside this rather than overloading it.
  home_course TEXT,
  owner_id    UUID        NOT NULL REFERENCES users(id),
  -- Billing spine. Both tiers are paid: /clubs/[slug] is a post-paywall page and
  -- a club only exists once provisioned, so there is deliberately no 'free'
  -- state here. seat_limit is denormalized from tier so a club can be granted
  -- extra seats without inventing a tier.
  tier        TEXT        NOT NULL DEFAULT 'small'
                          CHECK (tier IN ('small', 'large')),
  seat_limit  INT         NOT NULL CHECK (seat_limit > 0),
  is_public   BOOLEAN     NOT NULL DEFAULT false,   -- private + noindex by default; public is opt-in
  settings    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clubs_owner_idx ON clubs (owner_id);

CREATE TABLE IF NOT EXISTS club_members (
  club_id    UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,                  -- always written lowercased
  -- RESTRICT, not SET NULL: nulling user_id on an active row would leave a seat
  -- that bills for nobody and can never be re-claimed (the bind only touches
  -- 'invited' rows). Deleting a user who still holds a seat therefore fails
  -- loudly, and account deletion must first demote the membership to 'removed'
  -- (which clears user_id and is allowed by the CHECK below).
  user_id    UUID        REFERENCES users(id) ON DELETE RESTRICT,  -- NULL = invite unclaimed
  role       TEXT        NOT NULL DEFAULT 'member'
                         CHECK (role IN ('owner', 'admin', 'member')),
  -- 'removed' is a tombstone rather than a DELETE so a departed member's trip
  -- history (RSVPs, attendance, photos) still resolves in later steps.
  status     TEXT        NOT NULL DEFAULT 'invited'
                         CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),    -- doubles as roster sort order
  joined_at  TIMESTAMPTZ,                           -- set on bind; trip_poll_voters has no analog
  PRIMARY KEY (club_id, email),

  -- An 'active' member must resolve to a real user, and an 'invited' one must
  -- not yet — those are the two halves of the invite→bind lifecycle, and making
  -- them structural means a half-bound row can't exist. 'suspended' and
  -- 'removed' are deliberately unconstrained: either may or may not have ever
  -- been claimed.
  CONSTRAINT club_members_active_has_user
    CHECK (status <> 'active'  OR user_id IS NOT NULL),
  CONSTRAINT club_members_invited_unclaimed
    CHECK (status <> 'invited' OR user_id IS NULL)
);

CREATE INDEX IF NOT EXISTS club_members_user_idx  ON club_members (user_id);
-- Backs the unscoped bind-on-login lookup in lib/clubMembers.ts.
CREATE INDEX IF NOT EXISTS club_members_email_idx ON club_members (lower(email));

-- App connects via the postgres/service role (bypasses RLS); enabling RLS with
-- no policies keeps these tables inaccessible to the anon/authenticated API roles.
ALTER TABLE clubs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;
