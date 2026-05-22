import { NextResponse } from "next/server";
import type { QueryResult } from "pg";
import { getPgClient } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const joinCode = (code || "").toString().toUpperCase();

  const client = getPgClient();

  try {

    const roomRes = (await client.query(
      `select id from public.rooms where join_code = $1`,
      [joinCode]
    )) as QueryResult<{ id: string }>;

    if (roomRes.rowCount === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const roomId = roomRes.rows[0].id;

    const res = (await client.query(
      `select id, room_id, kind, content, payload, created_at
       from public.messages
       where room_id = $1
       order by created_at asc
       limit 200`,
      [roomId]
    )) as QueryResult<{
      id: string;
      room_id: string;
      kind: string;
      content: string;
      payload: any;
      created_at: string;
    }>;

    return NextResponse.json({ messages: res.rows }, { status: 200 });
  } catch (e: any) {
    console.error("GET /api/rooms/join/[code]/messages failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
