import { NextResponse } from "next/server";
import type { QueryResult } from "pg";
import { getPgClient } from "@/lib/db";
import { defaultRoomState } from "@/lib/roomState";

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

    // Ensure state row exists (idempotent)
    const upsertRes = (await client.query(
      `insert into public.room_state (room_id, state)
       values ($1, $2::jsonb)
       on conflict (room_id) do update set updated_at = now()
       returning state, updated_at`,
      [roomId, JSON.stringify(defaultRoomState())]
    )) as QueryResult<{ state: any; updated_at: string }>;

    const row = upsertRes.rows?.[0];

    return NextResponse.json(
      { state: row?.state ?? defaultRoomState(), updated_at: row?.updated_at ?? null },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("GET /api/rooms/join/[code]/state failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
