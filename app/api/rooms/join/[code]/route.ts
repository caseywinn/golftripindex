import { NextResponse } from "next/server";
import { getPgClient } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params; // ✅ unwrap params promise

  const client = getPgClient();
  try {
    await client.connect();

    const res = await client.query(
      `select * from public.rooms where join_code = $1`,
      [code.toUpperCase()]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ room: res.rows[0] }, { status: 200 });
  } catch (e: any) {
    console.error("GET /api/rooms/join/[code] failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  } finally {
    try {
      await client.end();
    } catch {}
  }
}
