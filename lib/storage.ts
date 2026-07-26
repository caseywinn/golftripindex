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

/**
 * Supabase's own code for a failure, which is NOT the HTTP status it sent.
 *
 * Storage answers 400 to both a rejected key and a missing bucket, and puts the
 * code that tells them apart in the body: {"statusCode":"403","error":"Unauthorized"}
 * versus {"statusCode":"404","error":"InvalidRequest"}. Branching on res.status
 * therefore cannot distinguish the two — this reads the inner value instead.
 */
function signFailureCode(body: string): number | null {
  try {
    const n = Number((JSON.parse(body) as { statusCode?: unknown }).statusCode);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Supabase refused to sign an upload, and `code` says why.
 *
 * Worth its own error type because that code is the entire diagnosis: 403 means
 * the key is wrong, 404 means the URL points at a project without this bucket.
 * Collapsing both into one Error is what made a permanently misconfigured
 * deployment indistinguishable from a transient failure.
 */
export class StorageSignError extends Error {
  /** Supabase's inner code, or the HTTP status if the body wasn't its usual JSON. */
  readonly code: number;

  constructor(
    readonly httpStatus: number,
    readonly body: string
  ) {
    super(`STORAGE_SIGN_FAILED http=${httpStatus} ${body}`);
    this.name = "StorageSignError";
    this.code = signFailureCode(body) ?? httpStatus;
  }
}

/**
 * The request to Storage never got an answer at all.
 *
 * Distinct from StorageSignError, which means Supabase replied and said no. This
 * is fetch itself throwing — DNS failure, a paused project, or a SUPABASE_URL
 * that isn't a URL. isStorageConfigured() only checks the variable is non-empty,
 * so a malformed one gets all the way here and used to surface as the same blank
 * "Try again." as everything else.
 */
export class StorageUnreachableError extends Error {
  constructor(
    readonly url: string,
    cause: unknown
  ) {
    super(`STORAGE_UNREACHABLE ${url}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "StorageUnreachableError";
  }
}

/**
 * Turn a storage failure into something worth showing, or null if it isn't one.
 *
 * Keeps the route from having to know the error taxonomy: anything this declines
 * to explain is a genuine surprise and belongs in the generic message.
 */
export function describeStorageFailure(err: unknown): string | null {
  if (err instanceof StorageSignError) return describeSignFailure(err.code);
  if (err instanceof StorageUnreachableError) {
    return `Storage never answered at ${err.url}. This site's Supabase URL may be wrong, or the project paused.`;
  }
  return null;
}

/**
 * What to show someone whose upload died because this deployment is misconfigured.
 *
 * The code is in the text on purpose. Every cause used to read "Could not start
 * the upload. Try again.", so telling a rejected key from a wrong project URL
 * meant going and reading the host's function logs — the site looked merely flaky
 * when it was actually never going to work. Only club owners and admins can reach
 * this, and it names no secret: just the code and which half of the configuration
 * is at fault.
 */
export function describeSignFailure(code: number): string {
  if (code === 401 || code === 403) {
    return `Storage rejected this site's key (${code}). Its Supabase key is invalid or has been disabled.`;
  }
  if (code === 404) {
    return `Storage has no "${TRIP_PHOTO_BUCKET}" bucket (404). This site's Supabase URL may point at the wrong project.`;
  }
  return `Storage would not start the upload (${code}). Try again.`;
}

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

/**
 * Mint a short-lived URL the browser can upload one object to directly.
 *
 * This is what keeps photo bytes out of the serverless function. Vercel caps a
 * function request body at ~4.5 MB — well under this bucket's 10 MB limit — and
 * rejects anything larger at the edge with FUNCTION_PAYLOAD_TOO_LARGE before the
 * route runs. Phone photos average ~3 MB, so routing them through the app failed
 * on a batch of two or three while working fine against `next dev`, which has no
 * such cap. The browser now PUTs straight to Supabase instead.
 *
 * The returned URL carries its own scoped token, so no service key reaches the
 * client and the token is good only for this exact object path.
 */
export async function createSignedUploadUrl(path: string): Promise<string> {
  const env = storageEnv();
  if (!env) throw new Error("STORAGE_NOT_CONFIGURED");

  let res: Response;
  try {
    res = await fetch(
      `${env.url}/storage/v1/object/upload/sign/${TRIP_PHOTO_BUCKET}/${encodeURI(path)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.key}`,
          apikey: env.key,
          "Content-Type": "application/json",
        },
        body: "{}",
      }
    );
  } catch (cause) {
    // No response to read a status from — a bad URL fails here, not above.
    throw new StorageUnreachableError(env.url, cause);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new StorageSignError(res.status, detail);
  }
  // Supabase returns a path-relative URL, e.g. "/object/upload/sign/<bucket>/<path>?token=…".
  const { url } = (await res.json()) as { url?: string };
  if (!url) throw new Error("STORAGE_SIGN_NO_URL");
  return `${env.url}/storage/v1${url}`;
}

/**
 * Whether an object actually landed in the bucket.
 *
 * The browser uploads on its own now, so the record step has to confirm the
 * object exists rather than take the client's word for it — otherwise a crafted
 * request could write a photo row pointing at nothing.
 */
export async function objectExists(path: string): Promise<boolean> {
  const env = storageEnv();
  if (!env) return false;
  try {
    const res = await fetch(
      `${env.url}/storage/v1/object/authenticated/${TRIP_PHOTO_BUCKET}/${encodeURI(path)}`,
      { method: "HEAD", headers: { Authorization: `Bearer ${env.key}`, apikey: env.key } }
    );
    return res.ok;
  } catch {
    return false;
  }
}

// Note: there is deliberately no server-side upload helper here. Sending photo
// bytes through the app was the bug — see createSignedUploadUrl above.

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
