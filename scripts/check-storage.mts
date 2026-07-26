/**
 * Test whether a given Supabase URL + key can actually run a photo upload.
 *
 * Walks the same four calls the upload path makes and reports which one breaks
 * and why, so a stale key can be told apart from a wrong project without reading
 * production logs. Deliberately standalone — no imports from lib/ — so it can be
 * pointed at any URL/key pair, including a deployment's, without touching the app.
 *
 *   npx tsx scripts/check-storage.mts                       # whatever .env.local has
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… npx tsx scripts/check-storage.mts
 *
 * Anything it uploads is deleted again, so this leaves no stray objects.
 */
import fs from "node:fs";

const BUCKET = "trip-photos";

function fromEnvFile(key: string): string | undefined {
  try {
    return fs
      .readFileSync(".env.local", "utf8")
      .match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]
      .trim()
      .replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const URL_ = (process.env.SUPABASE_URL || fromEnvFile("SUPABASE_URL") || "").replace(/\/$/, "");
const KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  fromEnvFile("SUPABASE_SECRET_KEY") ||
  fromEnvFile("SUPABASE_SERVICE_ROLE_KEY");

if (!URL_ || !KEY) {
  console.error("SUPABASE_URL and a key (SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY) must be set.");
  process.exit(1);
}

// The key format is a clue but not a verdict: a project that has migrated to
// sb_secret_ keys rejects the old service_role JWTs, but both shapes are legal
// text and only the calls below can say which one this project accepts.
const shape = KEY.startsWith("sb_secret_")
  ? "new-style (sb_secret_)"
  : KEY.startsWith("eyJ")
    ? "legacy service_role JWT — disabled on projects migrated to sb_secret_ keys"
    : "unrecognised format";
console.log(`url=${URL_}`);
console.log(`key=${KEY.slice(0, 12)}… ${shape}\n`);

const auth = { Authorization: `Bearer ${KEY}`, apikey: KEY };
let failed = false;

/**
 * Why a Storage call failed.
 *
 * The HTTP status is not the answer. Storage replies 400 to both a rejected key
 * and a missing bucket, and puts the code that separates them in the body —
 * {"statusCode":"403","error":"Unauthorized"} against {"statusCode":"404",…}.
 * Reading res.status alone reports every misconfiguration as a bad key.
 * lib/storage.ts describeSignFailure() makes the same distinction for the app.
 */
function explain(status: number, body: string): string {
  let code = status;
  let message = "";
  try {
    const parsed = JSON.parse(body) as { statusCode?: unknown; message?: unknown };
    const n = Number(parsed.statusCode);
    if (Number.isFinite(n)) code = n;
    if (typeof parsed.message === "string") message = ` — "${parsed.message}"`;
  } catch {
    /* not Supabase's usual JSON; fall back to the HTTP status */
  }
  if (code === 401 || code === 403) return `key rejected (${code}) — invalid, expired, or disabled${message}`;
  if (code === 404) return `not found (404) — bucket "${BUCKET}" is not in the project at this SUPABASE_URL${message}`;
  return `unexpected response (${code})${message}`;
}

/** A bad SUPABASE_URL fails DNS rather than returning a status; don't crash on it. */
async function call(label: string, url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch (e) {
    console.log(`${label} FAILED — could not reach ${new URL(url).host}: ${(e as Error).message}`);
    console.log("         SUPABASE_URL is unreachable; check it names a real project.");
    return null;
  }
}

// 1. Can the key see the bucket at all?
const listRes = await call("BUCKETS ", `${URL_}/storage/v1/bucket`, { headers: auth });
if (!listRes) process.exit(1);
if (listRes.ok) {
  const buckets = ((await listRes.json()) as { name: string }[]).map((b) => b.name);
  const has = buckets.includes(BUCKET);
  console.log(`BUCKETS  OK — [${buckets.join(", ")}]; "${BUCKET}" ${has ? "exists" : "IS MISSING"}`);
  if (!has) failed = true;
} else {
  console.log(`BUCKETS  FAILED — ${explain(listRes.status, await listRes.text())}`);
  failed = true;
}

// 2. Mint a signed upload URL, exactly as lib/storage.ts createSignedUploadUrl does.
const path = `_healthcheck/${crypto.randomUUID()}.jpg`;
const signRes = await call("SIGN    ", `${URL_}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: "{}",
});
if (!signRes) process.exit(1);
if (!signRes.ok) {
  console.log(`SIGN     FAILED — ${explain(signRes.status, await signRes.text())}`);
  console.log("\nThis is the call behind the upload error on the trip page.");
  process.exit(1);
}
const signedUrl = `${URL_}/storage/v1${((await signRes.json()) as { url: string }).url}`;
console.log("SIGN     OK — signed upload url issued");

// 3. Upload through it with no credentials, the way a browser does.
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAj/2Q==", "base64");
const putRes = await call("UPLOAD  ", signedUrl, {
  method: "PUT",
  headers: { "Content-Type": "image/jpeg" },
  body: jpeg,
});
if (!putRes) process.exit(1);
console.log(
  putRes.ok ? "UPLOAD   OK — browser-side PUT accepted" : `UPLOAD   FAILED — ${explain(putRes.status, await putRes.text())}`
);
if (!putRes.ok) failed = true;

// 4. Clean up.
if (putRes.ok) {
  const del = await call("CLEAN   ", `${URL_}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: "DELETE",
    headers: auth,
  });
  console.log(del?.ok ? "CLEAN    OK — probe object removed" : `CLEAN    FAILED — delete ${path} by hand`);
}

console.log(failed ? "\nThis configuration cannot upload photos." : "\nThis URL/key combination works.");
process.exit(failed ? 1 : 0);
