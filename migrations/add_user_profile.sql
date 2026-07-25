-- Profile fields on the users row, edited from /bag (the My Bag page).
--
-- The Handle the app already had is users.name — spaces allowed, shown across
-- the site (club rosters, "proposed by", etc.). These two add the golfer-facing
-- bits a bag wants: a handicap and a favourite trip.
--
-- Deliberately NOT here: a profile photo. There is no upload/storage mechanism
-- in the app yet, so avatars are a separate later pass rather than a column that
-- sits empty. Add `avatar TEXT` alongside these when that lands.

ALTER TABLE users ADD COLUMN IF NOT EXISTS handicap TEXT;

-- A published trip's slug (e.g. 'bandon-dunes'), resolved against Airtable at
-- render time. Free-form text rather than a FK: trips live in Airtable, not in
-- Postgres, so there is no users(favorite_trip) → trips(slug) to reference.
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_trip TEXT;
