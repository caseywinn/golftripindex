import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getPgClient } from "@/lib/db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params;
  const joinCode = code.toUpperCase();

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const client = getPgClient();
  try {
    await client.connect();

    const roomRes = await client.query(
      `select id from public.rooms where join_code = $1`,
      [joinCode]
    );
    if (roomRes.rowCount === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const roomId = roomRes.rows[0].id as string;

    const historyRes = await client.query(
      `select kind, content
       from public.messages
       where room_id = $1
       order by created_at asc
       limit 200`,
      [roomId]
    );

    const system =
      "You are GTI Caddie, a golf trip planning assistant for GolfTripIndex. Be concise and structured.";

    const input = [
      `SYSTEM: ${system}`,
      ...historyRes.rows.slice(-30).map((m: any) => `${String(m.kind).toUpperCase()}: ${m.content}`)
    ].join("\n");

    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input,
    });

    const assistantText =
      resp.output_text?.trim() ||
      "I’m not sure I understood—can you rephrase that?";

    const assistantInsert = await client.query(
      `insert into public.messages (room_id, kind, content, payload)
       values ($1, 'assistant', $2, '{}'::jsonb)
       returning *`,
      [roomId, assistantText]
    );

    return NextResponse.json(
      { assistantMessage: assistantInsert.rows[0] },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("POST /assistant failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  } finally {
    try { await client.end(); } catch {}
  }
}
