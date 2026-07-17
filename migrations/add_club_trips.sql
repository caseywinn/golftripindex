-- Club trips: the lifecycle spine (DRAFT → VOTING → PLANNING → LIVE → COMPLETED
-- → ARCHIVED). Step 2 only exercises 'voting'; the later states are declared now
-- so the CHECK doesn't need rewriting each step.
--
-- A club trip's vote is a plain shared_trips row. That is the whole point of the
-- design: /plan's poll engine (lib/planPoll, planVoteEngine, planBracket) works
-- unchanged, trip_poll_voters/trip_poll_ballots keep their FK cascade to
-- shared_trips, and there is exactly one voting codebase.
--
-- LINK DIRECTION: the FK lives on shared_trips (club_trip_id), NOT as a
-- shared_trip_id on club_trips. The design doc sketched both; two FKs pointing
-- at each other are a chicken-and-egg on insert and can disagree once written.
-- This direction is also the useful one — lib/planPoll already reads from
-- shared_trips, so it picks up club context in a query it was making anyway.

CREATE TABLE IF NOT EXISTS club_trips (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'voting'
                         CHECK (status IN ('draft', 'voting', 'planning', 'live', 'completed', 'archived')),
  -- Freeform label ("Fall 2026"). Null until someone names it; the destination
  -- list carries the meaning while a trip is still being voted on.
  title      TEXT,
  -- The winning destination slug, written when the poll closes. The poll itself
  -- re-derives results from ballots every read and persists no winner, so
  -- without this a closed club trip would have no durable answer to "where are
  -- we going" — and the ballots are cascade-deleted with the share row.
  chosen_destination TEXT,
  start_date DATE,
  end_date   DATE,
  -- Who proposed it. Kept for attribution; it does NOT confer captain rights —
  -- any club owner/admin can close the poll (see lib/planPoll.isPollCaptain), so
  -- a trip doesn't get stranded when its proposer goes quiet or leaves.
  created_by UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT club_trips_dates_ordered
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

-- The club page's main query: this club's trips, newest first.
CREATE INDEX IF NOT EXISTS club_trips_club_idx ON club_trips (club_id, created_at DESC);

-- The poll for a club trip. NULL for every /plan share, which is the normal case.
-- CASCADE: deleting a club trip should take its vote with it — the poll has no
-- meaning on its own, and trip_poll_voters/ballots already cascade from here.
ALTER TABLE shared_trips
  ADD COLUMN IF NOT EXISTS club_trip_id UUID REFERENCES club_trips(id) ON DELETE CASCADE;

-- One poll per club trip. Partial so the many NULLs (every /plan share) don't
-- collide with each other. Re-voting later means a new club trip, not a second
-- poll on this one.
CREATE UNIQUE INDEX IF NOT EXISTS shared_trips_club_trip_uniq
  ON shared_trips (club_trip_id) WHERE club_trip_id IS NOT NULL;

-- App connects via the postgres/service role (bypasses RLS); enabling RLS with
-- no policies keeps the table inaccessible to the anon/authenticated API roles.
ALTER TABLE club_trips ENABLE ROW LEVEL SECURITY;
