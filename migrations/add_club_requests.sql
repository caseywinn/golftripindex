-- Request-to-join: a logged-in user can ask to join a club from its URL, and an
-- owner/admin approves or rejects.
--
-- This is the mirror image of an invite. An invite is club → person, so the row
-- is created by the club and keyed by an email that may not have an account yet
-- (user_id NULL until they log in). A request is person → club, so the requester
-- is always a real logged-in user and user_id is known at insert time. Hence the
-- constraint below: 'requested' rows must be bound, exactly inverting the
-- 'invited' rule.
--
-- SEATS: a pending request does NOT hold a seat. An invite does, because the
-- club committed a seat by extending it; a request is someone else's ask and the
-- club hasn't agreed to anything. The seat is only consumed on approval, which
-- is therefore where the seat check has to happen.

ALTER TABLE club_members DROP CONSTRAINT IF EXISTS club_members_status_check;
ALTER TABLE club_members ADD CONSTRAINT club_members_status_check
  CHECK (status IN ('invited', 'requested', 'active', 'suspended', 'removed'));

-- A request always comes from a logged-in user, so it is always bound. Mirrors
-- club_members_invited_unclaimed, which requires the opposite for invites.
ALTER TABLE club_members DROP CONSTRAINT IF EXISTS club_members_requested_bound;
ALTER TABLE club_members ADD CONSTRAINT club_members_requested_bound
  CHECK (status <> 'requested' OR user_id IS NOT NULL);
