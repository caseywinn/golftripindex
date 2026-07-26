// Upload policy shared by the two halves of the photo flow: the route that mints
// signed upload URLs and the route that records the finished objects. They have
// to agree on what a legal photo is, so the rules live in one place.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepted MIME types and the extension each one gets in storage. */
export const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Matches the bucket's own file_size_limit; Supabase rejects anything larger. */
export const MAX_BYTES = 10 * 1024 * 1024;

export const MAX_FILES = 20;

/** The object path a photo gets: always inside the trip's own folder. */
export function photoPath(tripId: string, ext: string): string {
  return `${tripId}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Whether a client-supplied path is one we would have minted for this trip.
 *
 * The browser uploads directly now and hands back the path, so this is the check
 * that stops a manager of one trip from recording a photo against another's
 * folder — the path must sit under this tripId and match photoPath()'s shape.
 */
export function isOwnPhotoPath(path: unknown, tripId: string): path is string {
  return (
    typeof path === "string" &&
    new RegExp(
      `^${tripId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp)$`,
      "i"
    ).test(path)
  );
}
