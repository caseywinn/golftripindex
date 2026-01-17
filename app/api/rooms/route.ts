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
    console.log("POST /api/rooms: connecting...");
    await withTimeout(client.connect(), 3000, "connect");
    console.log("POST /api/rooms: connected");

    // Generate join_code (required by your schema)
    const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const slug = `room-${Date.now()}`;

    console.log("POST /api/rooms: inserting...");
    const roomRes = await withTimeout(
      client.query(
        `insert into public.rooms (slug, join_code) values ($1, $2) returning *`,
        [slug, joinCode]
      ),
      5000,
      "insert"
    );
    console.log("POST /api/rooms: inserted");

    return NextResponse.json({ room: roomRes.rows[0] }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/rooms failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  } finally {
    try {
      await client.end();
    } catch {}
  }
}
