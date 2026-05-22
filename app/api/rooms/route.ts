import { NextResponse } from "next/server";
import { getPgClient } from "@/lib/db";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

export async function POST() {
  console.log("POST /api/rooms: start");
  console.log("POST /api/rooms: DATABASE_URL set:", !!process.env.DATABASE_URL);

  const client = getPgClient();

  try {

    const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const slug = `room-${Date.now()}`;

    console.log("POST /api/rooms: inserting room...");
    const roomRes = await withTimeout(
      client.query(
        `insert into public.rooms (slug, join_code) values ($1, $2) returning *`,
        [slug, joinCode]
      ),
      5000,
      "insert room"
    );

    const room = roomRes.rows[0];
    console.log("POST /api/rooms: inserted", room?.id);

    console.log("POST /api/rooms: initializing room_state...");
    await withTimeout(
      client.query(
        `insert into public.room_state (room_id, state)
         values ($1, '{}'::jsonb)
         on conflict (room_id) do nothing`,
        [room.id]
      ),
      5000,
      "insert room_state"
    );

    return NextResponse.json({ room }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/rooms failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
