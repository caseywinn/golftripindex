-- Password reset tokens, issued by /api/auth/forgot-password and spent by
-- /api/auth/reset-password.
--
-- The raw token only ever exists in the reset link that goes out by email. What
-- lands here is its SHA-256 hash, so a leaked database dump cannot be replayed
-- into account takeovers the way a table of plaintext tokens could. Lookup is by
-- hash, which is why the index is on token_hash rather than user_id.
--
-- Rows are deliberately kept after use: used_at is what makes a second click on
-- the same emailed link fail closed instead of silently re-opening the window.
-- Prune with `DELETE FROM password_resets WHERE expires_at < now() - interval
-- '30 days'` if the table ever grows enough to matter.

CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_resets_token_hash_idx ON password_resets (token_hash);

-- Supports the "invalidate this user's other outstanding links" sweep that runs
-- whenever a reset is spent or a new one is requested.
CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets (user_id);

-- Server-only table, same reasoning as share_log in enable_rls.sql: the app
-- reaches it over a direct postgres connection, so this only shuts the door on
-- PostgREST.
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
