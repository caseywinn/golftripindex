import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getPgClient } from "@/lib/db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

function clamp<T>(arr: T[], max: number) {
  return arr.length <= max ? arr : arr.slice(arr.length - max);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const { code } = await ctx.params;
  const joinCode = code.toUpperCase();

  const body = await req.json().catch(() => ({}));
  const content = body?.content;
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  const client = getPgClient();

  try {
    await withTimeout(client.connect(), 3000, "db connect");

    // 1) Resolve room
    const roomRes = await withTimeout(
      client.query(`select id from public.rooms where join_code = $1`, [joinCode]),
      3000,
      "room lookup"
    );
    if (roomRes.rowCount === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const roomId = roomRes.rows[0].id as string;

    // 2) Insert user message
    const userInsert = await withTimeout(
      client.query(
        `insert into public.messages (room_id, kind, content, payload)
         values ($1, 'user', $2, '{}'::jsonb)
         returning *`,
        [roomId, content]
      ),
      3000,
      "insert user message"
    );
    const userMessage = userInsert.rows[0];

    // 3) Fetch recent history for context (excluding payload for now)
    const historyRes = await withTimeout(
      client.query(
        `select kind, content
         from public.messages
         where room_id = $1
         order by created_at asc
         limit 200`,
        [roomId]
      ),
      3000,
      "load history"
    );
    const history = clamp(historyRes.rows, 30);

    // 4) Build prompt (tight MVP)
    const system = [
      "You are GTI Caddie, a golf trip planning assistant for GolfTripIndex.",
      "Be concise and structured.",
      "Ask 1-3 clarifying questions when needed.",
      "Prefer actionable recommendations with tradeoffs."
    ].join(" ");

    const input = [
      `SYSTEM: ${system}`,
      ...history.map((m: any) => `${String(m.kind).toUpperCase()}: ${m.content}`),
      `USER: ${content}`,
    ].join("\n");

    // 5) OpenAI call (non-streaming MVP)
    const resp = await withTimeout(
      openai.responses.create({
        model: "gpt-4o-mini",
        input,
      }),
      15000,
      "openai"
    );

    const assistantText =
      resp.output_text?.trim() ||
      "I’m not sure I understood—can you rephrase that?";

    // 6) Insert assistant message
    const assistantInsert = await withTimeout(
      client.query(
        `insert into public.messages (room_id, kind, content, payload)
         values ($1, 'assistant', $2, $3::jsonb)
         returning *`,
        [
          roomId,
          assistantText,
          JSON.stringify({
            model: "gpt-4o-mini",
            openai_response_id: resp.id ?? null,
          }),
        ]
      ),
      3000,
      "insert assistant message"
    );

    const assistantMessage = assistantInsert.rows[0];

    return NextResponse.json({ userMessage, assistantMessage }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/rooms/join/[code]/chat failed:", e?.stack ?? e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  } finally {
    try { await client.end(); } catch {}
  }
}
