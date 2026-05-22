import { NextResponse } from "next/server";
import { getPgClient } from "@/lib/db";

export async function POST() {
  const client = getPgClient();

  try {
    const slug = `room-${Date.now()}`;

    const roomRes = await client.query(
      `insert into public.rooms (slug) values ($1) returning *`,
      [slug]
    );

    const room = roomRes.rows[0];

    // Initialize state + summary (safe even if you run twice)
    await client.query(
      `insert into public.room_state (room_id, state)
       values ($1, '{}'::jsonb)
       on conflict (room_id) do nothing`,
      [room.id]
    );

    await client.query(
      `insert into public.room_summary (room_id, summary)
       values ($1, '')
       on conflict (room_id) do nothing`,
      [room.id]
    );

    return NextResponse.json({ room }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
