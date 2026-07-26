import { NextRequest, NextResponse } from "next/server";
import Airtable from "airtable";

const SUBSCRIBERS_TABLE = process.env.AIRTABLE_SUBSCRIBERS_TABLE || "Subscribers";

function getBase() {
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
 *   404     — AIRTABLE_SUBSCRIBERS_TABLE names a table that isn't in this base
 *   422     — a field name in the create() call doesn't match the table's columns
 */
function describe(err: unknown): string {
  const e = err as { statusCode?: number; error?: string; message?: string };
  return [
    e?.statusCode ? `status=${e.statusCode}` : null,
    e?.error ? `error=${e.error}` : null,
    e?.message ?? String(err),
  ]
    .filter(Boolean)
    .join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const base = getBase();
    await base(SUBSCRIBERS_TABLE).create([
      { fields: { Email: email.toLowerCase().trim(), "Signed Up At": new Date().toISOString().slice(0, 10) } },
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    // This was a bare `catch {}`. Signups failed silently in production for as
    // long as they did because nothing recorded why — the route returned
    // "Server error" and threw away the only copy of the cause.
    console.error(`[subscribe] write to table "${SUBSCRIBERS_TABLE}" failed: ${describe(err)}`);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
