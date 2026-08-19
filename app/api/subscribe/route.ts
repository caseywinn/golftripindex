import { NextRequest, NextResponse } from "next/server";
import { getWriteBase, describeAirtableError } from "@/lib/airtableWrite";

const SUBSCRIBERS_TABLE = process.env.AIRTABLE_SUBSCRIBERS_TABLE || "Subscribers";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const base = getWriteBase();
    await base(SUBSCRIBERS_TABLE).create([
      { fields: { Email: email.toLowerCase().trim(), "Signed Up At": new Date().toISOString().slice(0, 10) } },
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    // This was a bare `catch {}`. Signups failed silently in production for as
    // long as they did because nothing recorded why — the route returned
    // "Server error" and threw away the only copy of the cause.
    console.error(
      `[subscribe] write to table "${SUBSCRIBERS_TABLE}" failed: ${describeAirtableError(err)}`
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
