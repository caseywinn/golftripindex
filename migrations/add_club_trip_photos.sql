-- Photos uploaded to a club trip's recap. The files live in Supabase Storage
-- (bucket 'trip-photos'); this table holds one row per photo with the object
-- path and its public URL, plus who uploaded it.
--
-- CASCADE on club_trip_id: deleting a trip removes its photo rows. The storage
-- objects themselves are cleaned up by the delete route, not the FK.
CREATE TABLE IF NOT EXISTS club_trip_photos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_trip_id UUID        NOT NULL REFERENCES club_trips(id) ON DELETE CASCADE,
  path         TEXT        NOT NULL,   -- object path within the bucket
  url          TEXT        NOT NULL,   -- public URL
  uploaded_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_trip_photos_trip_idx
  ON club_trip_photos (club_trip_id, created_at);
