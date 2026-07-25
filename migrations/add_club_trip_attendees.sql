-- Who came on a club trip, and who may see the trip.
--
-- attendees: ordered JSONB array of { userId, name }. `userId` is a users.id when
-- the attendee is a club member (picked from the roster), or null for a guest
-- typed in by hand. `name` is always present and is what the page renders.
-- Mirrors the courses column added alongside it.
ALTER TABLE club_trips
  ADD COLUMN IF NOT EXISTS attendees JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Visibility: 'club' = every club member can see the trip (the default); 'attendees'
-- = only the people who came (plus owners/admins, who manage it) can. Enforced in
-- app code — the app connects as the service role and bypasses RLS.
ALTER TABLE club_trips
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'club'
    CHECK (visibility IN ('club', 'attendees'));
