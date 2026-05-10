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
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
