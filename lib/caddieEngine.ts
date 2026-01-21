// /lib/caddieEngine.ts
import OpenAI from "openai";
import type { GTISearchHit } from "@/lib/types";
import {
  gtiSearch,
  gtiResolveAnchor,
  getTripDetailBySlug,
} from "@/lib/gti";

export type ChatRoleMsg = { role: "user" | "assistant"; content: string };

type Option = { id: string; label: string; value?: string };

export type AssistantPayload =
  | {
      kind: "question";
      step?: string;
      text?: string;
      allowFreeText?: boolean;
      options?: Option[];
    }
  | {
      kind: "info";
      step?: string;
      text?: string;
    }
  | {
      kind: string;
      step?: string;
      [k: string]: any;
    };

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function stripJsonFences(s: string) {
  return String(s || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function clamp<T>(arr: T[], max: number) {
  return arr.length <= max ? arr : arr.slice(arr.length - max);
}

function looksIncompleteText(t: string) {
  const s = (t || "").trim();
  if (!s) return true;
  if (s.endsWith(":")) return true;
  if (s.endsWith("…")) return true;
  if (s.length < 80) return true;
  return false;
}

function renderListFromPayload(payload: any) {
  // Minimal generic stitcher. Extend later if you add more payload kinds.
  const shortlist = Array.isArray(payload?.shortlist) ? payload.shortlist : [];
  if (!shortlist.length) return "";

  const lines: string[] = [];
  lines.push("Recommendations:");
  for (const item of shortlist) {
    const name = item?.tripName || item?.tripSlug || "Option";
    const why = Array.isArray(item?.whyItFits) ? item.whyItFits : [];
    const tradeoffs = Array.isArray(item?.tradeoffs) ? item.tradeoffs : [];
    lines.push(`- ${name}`);
    if (why.length) lines.push(`  - Why: ${why.join("; ")}`);
    if (tradeoffs.length) lines.push(`  - Tradeoffs: ${tradeoffs.join("; ")}`);
  }
  return lines.join("\n");
}

export type CaddieTurnOutput = {
  assistantContent: string;
  assistantPayload: AssistantPayload;
  state_patch: any;
  // debug/meta
  gtiResultsCount: number;
  anchor: any;
  tripDetailUsed: boolean;
};

export async function runCaddieTurnShared(args: {
  content: string;

  // room provides this; widget can pass a lightweight default
  currentState: any;

  // history in room is DB-based; widget is local messages
  history: Array<{ kind: string; content: string }> | ChatRoleMsg[];

  // optional tool results (room may pass; widget can omit)
  publicInfo?: any;
  publicGolfDetails?: any;
  publicWeb?: any;

  // if you want to skip calling tools inside this engine (room already computed)
  gtiResults?: GTISearchHit[];
  anchor?: any;
  tripDetail?: any;

  // if you want to force an existing active trip context
  effectiveTripSlug?: string | null;
}) {
  const content = String(args.content || "").trim();
  if (!content) throw new Error("Missing content");

  const openai = getOpenAIClient();

  // ---- 1) Grounding (shared) ----
  const gtiResults =
    args.gtiResults ??
    ((await gtiSearch(content).catch(() => [])) as GTISearchHit[]);

  const anchor =
    args.anchor ??
    (await gtiResolveAnchor(content).catch(() => ({ kind: "none" })));

  // Prefer explicit override, else anchor trip, else current state
  const anchoredTripSlug =
    anchor?.kind === "trip" && anchor?.trip?.slug ? String(anchor.trip.slug) : null;

  const effectiveTripSlug =
    args.effectiveTripSlug ??
    anchoredTripSlug ??
    args.currentState?.activeTripSlug ??
    null;

  const tripDetail =
    args.tripDetail ??
    (effectiveTripSlug
      ? await getTripDetailBySlug(effectiveTripSlug).catch(() => null)
      : null);

  // ---- 2) Normalize history into your room’s HISTORY format ----
  // Room uses {kind, content}; widget uses {role, content}.
  const historyLines: string[] = [];

  const h = Array.isArray(args.history) ? args.history : [];
  const last = clamp(h as any[], 30);

  for (const m of last) {
    if (m?.kind) {
      historyLines.push(`${String(m.kind).toUpperCase()}: ${m.content}`);
      continue;
    }
    if (m?.role) {
      const k = m.role === "assistant" ? "ASSISTANT" : "USER";
      historyLines.push(`${k}: ${m.content}`);
      continue;
    }
  }

  // ---- 3) Single shared prompt + input assembly (match room route) ----
  const system = [
    "You are GTI Caddie, the conversational assistant for GolfTripIndex.com.",
    "Scope: golf trips, trip details, courses within/near trips, vibe, food & lodging overview, high-level airports/drive estimates, golf course details, and booking timelines.",
    "Never act as a travel agent. Do not discuss specific flights/airlines, tee times, or booking transactions.",
    "",
    "Data sources:",
    "1) TRIP_DETAIL_JSON (authoritative when present for the active trip: courses.must_play/should_play/want_more, plus trip prose fields).",
    "2) GTI_RESULTS_JSON (search hits from Airtable). Use to discover trips/courses and to anchor context.",
    "3) PUBLIC_INFO_JSON is allowed only when Airtable is insufficient.",
    "4) PUBLIC_GOLF_DETAILS_JSON is allowed only when Airtable is insufficient.",
    "5) Never claim you searched the internet or used online sources.",
    "",
    "Behavior rules:",
    "- If TRIP_DETAIL_JSON exists and the user asks about nearby courses or other courses in the area, answer using courses.want_more first, then trip.wantMore prose.",
    "- If the user asks about courses included in a trip, use courses.must_play and courses.should_play, then trip.dataDump prose.",
    "- If the user asks about food/lodging, use trip.foodAndLodgingOverview first, then trip.dataDump prose.",
    "- Keep the conversation context: if activeTripSlug is set, assume the user is still on that trip unless they switch.",
    "- If the user asks about holes/routing/architect/conditions/etc, use Airtable first. If Airtable is missing those details, you may use PUBLIC_GOLF_DETAILS_JSON or PUBLIC_INFO_JSON.",
    "- If the user asks about a trip/location that is not in Airtable and there is no active trip, ask a clarifying question instead of guessing.",
    "- Never mention GTI or Airtable.",
    "- Never discuss history, politics, war, nudity, sex, or violence.",
    "",
    "Output MUST be valid JSON only with keys:",
    `{"assistantContent":"...","assistantPayload":{...},"state_patch":{...}}`,
    "",
    "assistantPayload is optional UI metadata. Use {\"kind\":\"info\"} if no buttons.",
    "state_patch should ONLY include fields you are confident about (e.g., activeTripSlug/activeTripName/activeState, daysOfGolf, budgetTier).",
    "Do not invent trips/courses that are not present in Airtable.",
    "",
    "CRITICAL:",
    "- assistantContent MUST be a complete, standalone answer with all details included.",
    "- Do NOT put key information only in assistantPayload. Payload should only duplicate/structure what is already in assistantContent.",
  ].join("\n");

  const input = [
    `SYSTEM:\n${system}`,
    `CURRENT_STATE_JSON:\n${JSON.stringify(args.currentState ?? {})}`,
    `ANCHOR_JSON:\n${JSON.stringify(anchor ?? null)}`,
    `TRIP_DETAIL_JSON:\n${JSON.stringify(tripDetail ?? null)}`,
    `GTI_RESULTS_JSON:\n${JSON.stringify(gtiResults ?? [])}`,
    `PUBLIC_INFO_JSON:\n${JSON.stringify(args.publicInfo ?? null)}`,
    `PUBLIC_GOLF_DETAILS_JSON:\n${JSON.stringify(args.publicGolfDetails ?? null)}`,
    `PUBLIC_WEB_JSON:\n${JSON.stringify(args.publicWeb ?? null)}`,
    "HISTORY:",
    ...historyLines,
    "",
    "Return JSON only:",
    `{"assistantContent":"...","assistantPayload":{"kind":"info"},"state_patch":{}}`,
    "",
    `USER_NOW: ${content}`,
  ].join("\n");

  // ---- 4) OpenAI call (same API as room) ----
  const resp = await openai.responses.create({
    model: "gpt-4o-mini",
    input,
  });

  const raw = stripJsonFences((resp as any)?.output_text?.trim() || "");
  let assistantContent = "";
  let assistantPayload: AssistantPayload = { kind: "info" };
  let state_patch: any = {};

  try {
    const parsed = JSON.parse(raw);
    assistantContent = String(parsed?.assistantContent || "").trim();
    if (parsed?.assistantPayload && typeof parsed.assistantPayload === "object") {
      assistantPayload = parsed.assistantPayload;
    }
    state_patch =
      parsed?.state_patch && typeof parsed.state_patch === "object"
        ? parsed.state_patch
        : {};
  } catch {
    assistantContent = raw || "I’m not sure I understood—can you rephrase that?";
    assistantPayload = { kind: "info" };
    state_patch = {};
  }

  if (!assistantContent) assistantContent = "I’m not sure I understood—can you rephrase that?";

  // ---- 5) “Cut off” protection (server-side stitch if needed) ----
  if (assistantPayload?.kind === "recommendations" && looksIncompleteText(assistantContent)) {
    const stitched = renderListFromPayload(assistantPayload);
    if (stitched) {
      const intro = assistantContent.trim();
      assistantContent = intro && !intro.endsWith(":") ? `${intro}\n\n${stitched}` : stitched;
    }
  }

  return {
    assistantContent,
    assistantPayload,
    state_patch,
    gtiResultsCount: Array.isArray(gtiResults) ? gtiResults.length : 0,
    anchor,
    tripDetailUsed: !!tripDetail,
  } satisfies CaddieTurnOutput;
}
