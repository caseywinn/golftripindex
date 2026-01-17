import { NextResponse } from "next/server";
import { getPgClient } from "@/lib/db";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const content = body?.content;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  const client = getPgClient();
  try {
    await client.connect();

    const roomRes = await client.query(
      `select id from public.rooms where join_code = $1`,
      [code.toUpperCase()]
    );
    if (roomRes.rowCount === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const roomId = roomRes.rows[0].id;

    const msgRes = await client.query(
      `insert into public.messages (room_id, content) values ($1, $2) returning *`,
      [roomId, content]
    );

    return NextResponse.json({ message: msgRes.rows[0] }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/rooms/join/[code]/messages failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  } finally {
    try { await client.end(); } catch {}
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params;

  const client = getPgClient();
  try {
    await client.connect();

    const roomRes = await client.query(
      `select id from public.rooms where join_code = $1`,
      [code.toUpperCase()]
    );
    if (roomRes.rowCount === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const roomId = roomRes.rows[0].id;

    const res = await client.query(
      `select * from public.messages
       where room_id = $1
       order by created_at asc
       limit 100`,
      [roomId]
    );

    return NextResponse.json({ messages: res.rows }, { status: 200 });
  } catch (e: any) {
    console.error("GET /api/rooms/join/[code]/messages failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  } finally {
    try { await client.end(); } catch {}
  }
}
