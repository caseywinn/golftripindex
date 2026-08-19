import Airtable from "airtable";

/**
 * Shared mechanics for the public forms that WRITE to Airtable (/api/subscribe,
 * /api/events/apply). Read paths belong in lib/airtable.ts — this file exists
 * only so the two write routes don't each carry their own copy of the base
 * setup and the error decoder.
 */

export function getWriteBase(): Airtable.Base {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) throw new Error("Missing Airtable env vars");
  Airtable.configure({ apiKey });
  return Airtable.base(baseId);
}

/**
 * Shape an Airtable client error into something a log reader can act on.
 *
 * Airtable puts the useful part on `statusCode` and `error`, neither of which
 * survives String(err). The three that matter here:
 *   401/403 — the token can't write to this base (read-only scope is the usual cause)
 *   404     — the configured table name isn't in this base
 *   422     — a field name in the create() call doesn't match the table's columns
 */
export function describeAirtableError(err: unknown): string {
  const e = err as { statusCode?: number; error?: string; message?: string };
  return [
    e?.statusCode ? `status=${e.statusCode}` : null,
    e?.error ? `error=${e.error}` : null,
    e?.message ?? String(err),
  ]
    .filter(Boolean)
    .join(" ");
}
