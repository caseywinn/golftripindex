-- Optional link from a club trip to a GTI destination (a GolfTrips slug), so the
-- trip's own courses + side trips can drive the "courses played" picker.
--
-- Kept separate from chosen_destination on purpose: a voted trip's
-- chosen_destination is already a slug (resolvable on its own), but a manually
-- recorded trip's chosen_destination is free-text display ("Pinehurst, NC") that
-- must stay as typed. destination_slug is where the manager links the catalog
-- trip without overwriting that display text.
ALTER TABLE club_trips ADD COLUMN IF NOT EXISTS destination_slug TEXT;
