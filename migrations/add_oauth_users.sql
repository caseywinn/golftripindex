-- Make identity provider-independent.
--
-- Before this, NextAuth ran with no adapter and no signIn/jwt callback, so the
-- only INSERT INTO users was the credentials register route. A Google sign-in
-- never wrote a users row at all: session.user.id was a real users.id for
-- credentials logins but Google's opaque subject string for Google ones. Rows in
-- user_items / shared_trips / trip_poll_voters key off that value, and the roster
-- join (LEFT JOIN users u ON u.id::text = v.user_id) silently missed for Google
-- users. auth.ts now resolves-or-creates a users row by email on sign-in and
-- normalizes token.sub to that local id.
--
-- Google users have no password. password_hash was NOT NULL, which would reject
-- the upsert, so it becomes nullable. A NULL password_hash now means "OAuth-only
-- account, no password login" — auth.ts rejects those in the credentials path
-- rather than letting bcrypt.compare(pw, null) do it by accident.
--
-- Safe to run against existing data: every current row has a password_hash, and
-- dropping NOT NULL never rewrites rows. No backfill was needed because no
-- Google-subject-shaped user_id existed anywhere at the time of writing.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Relied on by the ON CONFLICT (email) upsert in lib/users.ts. Already present as
-- users_email_key; asserted here so a fresh environment can't drift.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (email)'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
END $$;
