import { NextResponse } from "next/server";
import { runCaddieTurnShared, type ChatRoleMsg } from "@/lib/caddieEngine";

function safeJson(req: Request) {
  return req.json().catch(() => ({}));
}

function defaultState() {
  return {
    mode: null,
    activeTripSlug: null,
    activeTripName: null,
    activeState: null,
    players: null,
    daysOfGolf: null,
    timeframe: null,
    budgetTier: null,
    vibe: [],
    top100Focus: null,
    homeAirport: null,
    step: "widget",
  };
}

export async function POST(req: Request) {
  try {
    const body = await safeJson(req);
    const content = String(body?.content ?? "").trim();
    const messages = Array.isArray(body?.messages) ? (body.messages as ChatRoleMsg[]) : [];

    if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

    const out = await runCaddieTurnShared({
      content,
      currentState: defaultState(),
      history: messages, // widget messages are role-based; engine handles this
      // widget: keep public enrichments off for now
      publicInfo: null,
      publicGolfDetails: null,
      publicWeb: null,
    });

    return NextResponse.json({
      assistantMessage: {
        id: `asst_${Date.now()}`,
        kind: "assistant",
        content: out.assistantContent,
        created_at: new Date().toISOString(),
        payload: {
          ...out.assistantPayload,
          _meta: {
            gti_count: out.gtiResultsCount,
            has_trip_detail: out.tripDetailUsed,
            anchor: out.anchor,
            state_patch: out.state_patch,
          },
        },
      },
      // widget does not persist state; return it in case you later want client-side memory
      state_patch: out.state_patch,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
