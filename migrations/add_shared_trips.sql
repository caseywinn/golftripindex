-- Saved, shareable trip plans created from /plan.
-- Owned by a logged-in user; viewable read-only by anyone with the link id.
CREATE TABLE IF NOT EXISTS shared_trips (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  state      JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_trips_user_idx ON shared_trips (user_id);

-- App connects via the postgres/service role (bypasses RLS); enabling RLS with
-- no policies keeps the table inaccessible to the anon/authenticated API roles.
ALTER TABLE shared_trips ENABLE ROW LEVEL SECURITY;
