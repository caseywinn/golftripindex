-- Courses a club actually played on a trip, for the trip recap page.
--
-- An ordered JSONB array of { slug, name }: `slug` is a GolfCourses catalog slug
-- when the course was picked from the list (only the Top 100 are in the
-- catalog), or null when it was typed in by hand. `name` is always present and
-- is what the page renders — a slug is only there so a catalog course can link
-- to its page later. Matches how shared_trips.state.destinations already stores
-- a small trusted-shaped list rather than a normalized child table.

ALTER TABLE club_trips
  ADD COLUMN IF NOT EXISTS courses JSONB NOT NULL DEFAULT '[]'::jsonb;
