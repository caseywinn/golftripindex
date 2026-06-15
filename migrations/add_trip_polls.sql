-- Group voting on a shared /plan trip.
--
-- The poll's configuration (type, status, current round, bracket structure)
-- lives in shared_trips.state.vote — see lib/planVote.ts. These two tables hold
-- the things we query and gate on per-user: the closed roster of invited voters
-- (the denominator for auto-close) and one ballot per voter per round.

-- Closed roster of people allowed to vote on a poll. "Everyone" (for auto-close)
-- is exactly the set of rows here for a given shared_trip.
CREATE TABLE IF NOT EXISTS trip_poll_voters (
  shared_trip_id UUID        NOT NULL REFERENCES shared_trips(id) ON DELETE CASCADE,
  email          TEXT        NOT NULL,
  user_id        TEXT,                       -- filled when the invitee logs in and is matched
  is_captain     BOOLEAN     NOT NULL DEFAULT false,
  invited_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shared_trip_id, email)
);

CREATE INDEX IF NOT EXISTS trip_poll_voters_user_idx ON trip_poll_voters (user_id);

-- One ballot per voter per round. Re-voting before close upserts on the unique key.
-- Ballot shape varies by vote type (all validated server-side):
--   approval: { "approve": ["slug", ...] }
--   ranked:   { "order":   ["slug", ...] }   -- best first
--   bracket:  { "picks":   { "<matchupId>": "slug", ... } }  -- for `round`
CREATE TABLE IF NOT EXISTS trip_poll_ballots (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_trip_id UUID        NOT NULL REFERENCES shared_trips(id) ON DELETE CASCADE,
  user_id        TEXT        NOT NULL,
  round          INT         NOT NULL DEFAULT 1,
  ballot         JSONB       NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shared_trip_id, user_id, round)
);

CREATE INDEX IF NOT EXISTS trip_poll_ballots_trip_round_idx ON trip_poll_ballots (shared_trip_id, round);

-- App connects via the postgres/service role (bypasses RLS); enabling RLS with
-- no policies keeps these tables inaccessible to the anon/authenticated API roles.
ALTER TABLE trip_poll_voters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_poll_ballots ENABLE ROW LEVEL SECURITY;
