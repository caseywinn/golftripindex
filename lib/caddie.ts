import OpenAI from "openai";
import type { GTISearchHit } from "@/lib/types";
import { gtiSearch } from "@/lib/gti"; // adjust to your actual export

type Option = { id: string; label: string };

export type AssistantPayload =
  | {
      kind: "question";
      step?: string;
      options?: Option[];
      allowFreeText?: boolean;
      text?: string;
      freeTextHint?: string;
    }
  | {
      kind: "recommendations";
      step?: string;
      text?: string;
      shortlist?: Array<{
        tripSlug: string;
        tripName: string;
        whyItFits: string[];
        tradeoffs?: string[];
        extensionGolf?: string[];
      }>;
      followUp?: any;
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

export type ChatRoleMsg = { role: "user" | "assistant"; content: string };

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function looksIncompleteText(t: string) {
  const s = (t || "").trim();
  if (!s) return true;
  if (s.endsWith(":")) return true;
  if (s.endsWith("…")) return true;
  // If it’s extremely short, likely the model intended payload to carry details
  if (s.length < 80) return true;
  return false;
}

function renderRecommendationsFromPayload(payload: any) {
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

/**
 * Core contract:
 * - retrieval-first (GTI)
 * - output must follow the same payload rules used by your room UX
 * - returns BOTH text + structured payload
 */
export async function runCaddieTurn(args: {
  content: string;
  history: ChatRoleMsg[];
  meta?: { source?: string; step?: string; path?: string };

  // Optional: if you already build these in your room route, pass them in.
  tripDetailJson?: any; // TRIP_DETAIL_JSON (authoritative when present)
  publicInfoJson?: any; // PUBLIC_INFO_JSON (optional)
  publicGolfDetailsJson?: any; // PUBLIC_GOLF_DETAILS_JSON (optional)
}) {
  const content = (args.content || "").trim();
  if (!content) throw new Error("Missing content");

  // 1) Retrieval-first
  const hits: GTISearchHit[] = await gtiSearch(content).catch(() => []);

  const client = getOpenAIClient();

  // Consolidated system prompt (avoid competing system prompts).
  // This combines your earlier rules with the room rules and enforces complete text.
  const system = [
    "You are GTI Caddie, the conversational assistant for GolfTripIndex.com.",
    "Scope: golf trips, trip details, courses within/near trips, vibe, food & lodging overview, high-level airports/drive estimates, golf course details, and booking timelines.",
    "Never act as a travel agent. Do not discuss specific flights/airlines, tee times, or booking transactions.",
    "",
    "Data sources:",
    "1) TRIP_DETAIL_JSON (authoritative when present for the active trip: courses.must_play/should_play/want_more, plus trip prose fields).",
    "2) GTI_RESULTS_JSON (search hits). Use to discover trips/courses and to anchor context.",
    "3) PUBLIC_INFO_JSON is allowed only when Airtable is insufficient.",
    "4) PUBLIC_GOLF_DETAILS_JSON is allowed only when Airtable is insufficient.",
    "5) Never claim you searched the internet or used online sources.",
    "",
    "Behavior rules:",
    "- If TRIP_DETAIL_JSON exists and the user asks about nearby courses or other courses in the area, answer using courses.want_more first, then trip.wantMore prose.",
    "- If the user asks about courses included in a trip, use courses.must_play and courses.should_play, then trip prose.",
    "- If the user asks about food/lodging, use trip.foodAndLodgingOverview first, then other trip prose.",
    "- Keep the conversation context: if activeTripSlug is set, assume the user is still on that trip unless they switch.",
    "- If the user asks about holes/routing/architect/conditions/etc, use Airtable data first. If Airtable is missing those details, you may use PUBLIC_GOLF_DETAILS_JSON or PUBLIC_INFO_JSON.",
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

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },

    // Provide data sources as separate system messages
    { role: "system", content: `GTI_RESULTS_JSON: ${JSON.stringify(hits ?? [])}` },
  ];

  if (args.tripDetailJson) {
    messages.push({
      role: "system",
      content: `TRIP_DETAIL_JSON: ${JSON.stringify(args.tripDetailJson)}`,
    });
  }
  if (args.publicInfoJson) {
    messages.push({
      role: "system",
      content: `PUBLIC_INFO_JSON: ${JSON.stringify(args.publicInfoJson)}`,
    });
  }
  if (args.publicGolfDetailsJson) {
    messages.push({
      role: "system",
      content: `PUBLIC_GOLF_DETAILS_JSON: ${JSON.stringify(args.publicGolfDetailsJson)}`,
    });
  }

  messages.push(
    ...args.history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content }
  );

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices?.[0]?.message?.content || "{}";

  // IMPORTANT: parse the JSON object shape you enforce above
  let parsed: {
    assistantContent?: string;
    assistantPayload?: AssistantPayload;
    state_patch?: any;
  } = {};

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      assistantContent: raw,
      assistantPayload: { kind: "info", step: "fallback" },
      state_patch: {},
    };
  }

  // Normalize payload
  const payload: AssistantPayload =
    parsed.assistantPayload && typeof parsed.assistantPayload === "object"
      ? parsed.assistantPayload
      : { kind: "info", step: "fallback" };

  if (!payload.kind) payload.kind = "info";
  if (payload.kind === "question" && !Array.isArray((payload as any).options)) {
    (payload as any).options = [];
  }

  // Determine the primary text (assistantContent), with sane fallback
  let assistantText =
    String(parsed.assistantContent ?? "").trim() ||
    "Tell me your group size, days, and where you’re coming from.";

  // Server-side safety: if model put details into payload, stitch a readable answer.
  // (This guards against “Here are some great courses:” with nothing after.)
  if (payload?.kind === "recommendations" && looksIncompleteText(assistantText)) {
    const stitched = renderRecommendationsFromPayload(payload);
    if (stitched) {
      const intro = String(parsed.assistantContent ?? "").trim();
      const merged = intro && !intro.endsWith(":") ? `${intro}\n\n${stitched}` : stitched;
      assistantText = merged;
    }
  }

  return {
    assistantText,
    assistantPayload: payload,
    statePatch: parsed.state_patch ?? {},
    gtiHitsCount: Array.isArray(hits) ? hits.length : 0,
  };
}
