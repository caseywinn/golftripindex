import { NextResponse } from "next/server";
import { getPgClient } from "@/lib/db";
import type { AssistantPayload } from "@/lib/types";
import { defaultRoomState } from "@/lib/roomState";
import { getTop100SummaryForTripSlug } from "@/lib/gti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuestionPayload = Extract<AssistantPayload, { kind: "question" }>;
type QueryResult<Row = any> = { rows: Row[] };

function buildEntryPayload(): QuestionPayload {
  return {
    kind: "question",
    step: "entry",
    text: "Need a caddie? How can I help?",
    allowFreeText: true,
    options: [
      { id: "plan", label: "Planning a Trip", value: "Planning a Trip" },
      { id: "trip", label: "Trip Details", value: "Trip Details" },
      { id: "look", label: "Just Looking Around", value: "Just Looking Around" },
    ],
  };
}

async function safeJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function maybeConnect(client: any) {
  // Some implementations return pg.Client (needs connect), others return PoolClient (already connected)
  if (client && typeof client.connect === "function") {
    try {
      await withTimeout(client.connect(), 2500, "db connect");
    } catch {
      // ignore "already connected" or no-op; if it truly can't connect, queries will timeout anyway
    }
  }
}

async function cleanupClient(client: any) {
  try {
    if (client && typeof client.release === "function") {
      client.release();
      return;
    }
    if (client && typeof client.end === "function") {
      await client.end();
      return;
    }
  } catch {
    // ignore
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const joinCode = (code || "").toString().toUpperCase();

  const body = await safeJson(req);
  const persist = body?.persist !== false;

  const payload = buildEntryPayload();
  const content = payload.text;

  const client: any = getPgClient();

  try {
    console.log("assistant: start", { joinCode, persist });

    console.log("assistant: room lookup");
    const roomRes = (await withTimeout(
      client.query(`select id, join_code from rooms where join_code = $1 limit 1`, [joinCode]),
      4000,
      "room lookup"
    )) as QueryResult<{ id: string; join_code: string }>;

    const room = roomRes.rows?.[0];
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

    // If you want “bootstrap greeting” without persistence (widget preview), return here.
    if (!persist) {
      return NextResponse.json({ ok: true, roomId: room.id, payload });
    }

    console.log("assistant: message count");
    const countRes = (await withTimeout(
      client.query(`select count(*)::int as n from messages where room_id = $1`, [room.id]),
      4000,
      "message count"
    )) as QueryResult<{ n: number }>;

    const n = countRes.rows?.[0]?.n ?? 0;

    if (n === 0) {
      console.log("assistant: insert greeting");
      try {
        await withTimeout(
          client.query(
            `insert into messages (room_id, kind, content, payload)
            values ($1, 'assistant', $2, $3::jsonb)`,
            [room.id, content, JSON.stringify(payload)]
          ),
          4000,
          "insert greeting"
        );
      } catch (e: any) {
        if (String(e?.message || "").includes('column "kind"')) {
          await client.query(
            `insert into messages (room_id, role, content, payload)
            values ($1, 'assistant', $2, $3::jsonb)`,
            [room.id, content, JSON.stringify(payload)]
          );
        } else {
          throw e;
        }
      }
    } else {
      console.log("assistant: skip greeting (messages exist)", { n });
    }

    console.log("assistant: ensure room_state");
    await withTimeout(
      client.query(
        `insert into room_state (room_id, state)
         values ($1, $2::jsonb)
         on conflict (room_id) do nothing`,
        [room.id, JSON.stringify(defaultRoomState())]
      ),
      4000,
      "room_state upsert"
    );

    console.log("assistant: done");
    return NextResponse.json({ ok: true, roomId: room.id, payload, inserted: n === 0 });
  } catch (e: any) {
    console.error("assistant: error", e);
    return NextResponse.json(
      { error: e?.message ?? "assistant bootstrap failed", payload },
      { status: 500 }
    );
  }
}
