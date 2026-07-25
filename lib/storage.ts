// Thin wrapper over the Supabase Storage REST API for trip photos.
//
// Deliberately no @supabase/supabase-js dependency — the app already talks to
// Postgres over raw pg, and a couple of authenticated fetches cover upload and
// delete. Uses the service-role key server-side only; never import this into a
// client component.
//
// Setup (one-time, in the Supabase dashboard):
//   1. Create a public Storage bucket named 'trip-photos'.
//   2. Set SUPABASE_URL and a secret key env var (either name below).
// Until then isStorageConfigured() is false and the upload route says so.

export const TRIP_PHOTO_BUCKET = "trip-photos";

function storageEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  // Supabase's new "Secret" key (sb_secret_…) or the legacy service_role key —
  // either works. SUPABASE_SECRET_KEY matches the current dashboard naming;
  // SUPABASE_SERVICE_ROLE_KEY is kept for the legacy name.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function isStorageConfigured(): boolean {
  return storageEnv() !== null;
}

/** Public URL for an object (the bucket must be public-read). */
export function publicUrl(path: string): string {
  const env = storageEnv();
  if (!env) return "";
  return `${env.url}/storage/v1/object/public/${TRIP_PHOTO_BUCKET}/${path}`;
}

/** Upload bytes to the bucket and return the object's path + public URL. */
export async function uploadObject(
  path: string,
  body: ArrayBuffer,
  contentType: string
): Promise<{ path: string; url: string }> {
  const env = storageEnv();
  if (!env) throw new Error("STORAGE_NOT_CONFIGURED");

  const res = await fetch(
    `${env.url}/storage/v1/object/${TRIP_PHOTO_BUCKET}/${encodeURI(path)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.key}`,
        apikey: env.key,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      // Blob is a universally-accepted BodyInit (a raw Node Buffer is not).
      body: new Blob([body], { type: contentType }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`STORAGE_UPLOAD_FAILED ${res.status} ${detail}`);
  }
  return { path, url: publicUrl(path) };
}

/** Best-effort delete of an object; swallows failures (row is already gone). */
export async function deleteObject(path: string): Promise<void> {
  const env = storageEnv();
  if (!env) return;
  try {
    await fetch(`${env.url}/storage/v1/object/${TRIP_PHOTO_BUCKET}/${encodeURI(path)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.key}`, apikey: env.key },
    });
  } catch {
    /* orphaned object is acceptable; the DB row is the source of truth */
  }
}
