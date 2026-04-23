import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getPublishedJourneyBySlug } from "@/lib/airtable";
import type { JourneyWithStops } from "@/lib/types";

function getOpenAI() {
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

function buildJourneyContext(journey: JourneyWithStops): string {
  const lines: string[] = [
    `JOURNEY: ${journey.name}`,
    `Duration: ${journey.durationMinDays}–${journey.durationMaxDays} days`,
    journey.description ? `Description: ${journey.description}` : "",
    "",
    "STOPS:",
  ];

  for (const stop of journey.stops) {
    lines.push(`\nStop ${stop.stopOrder}: ${stop.locationName} (${stop.overnight ? "Overnight" : "Drive-through"})`);

    if (stop.courses.length) {
      const must = stop.courses.filter((c) => c.importance === "must_play");
      const should = stop.courses.filter((c) => c.importance === "should_play");
      const optional = stop.courses.filter((c) => c.importance === "want_more");

      if (must.length) lines.push(`  Must Play: ${must.map((c) => c.course.name).join(", ")}`);
      if (should.length) lines.push(`  Should Play: ${should.map((c) => c.course.name).join(", ")}`);
      if (optional.length) lines.push(`  Optional: ${optional.map((c) => c.course.name).join(", ")}`);
    }

    if (stop.overnight) {
      if (stop.hotels) lines.push(`  Hotels: ${stop.hotels}`);
      if (stop.restaurants) lines.push(`  Restaurants: ${stop.restaurants}`);
    }

    if (stop.bookingAdvice) lines.push(`  Booking Advice: ${stop.bookingAdvice}`);
    if (stop.notes) lines.push(`  Notes: ${stop.notes}`);
  }

  return lines.filter((l) => l !== "").join("\n");
}

function buildSystemPrompt(journey: JourneyWithStops): string {
  const context = buildJourneyContext(journey);

  return [
    `You are a golf journey planning assistant for GolfTripIndex.com.`,
    `You are helping a user plan their "${journey.name}" trip.`,
    ``,
    `${context}`,
    ``,
    `YOUR JOB:`,
    `- Help the user narrow down their itinerary based on their days, budget, group size, and preferences.`,
    `- Prioritize courses based on their importance tier: Must Play first, then Should Play, then Optional.`,
    `- Recommend hotels and restaurants from the journey data above. For specific details not listed, you may use general knowledge.`,
    `- Help with driving logistics and timing between stops.`,
    `- Provide booking advice when asked.`,
    ``,
    `RULES:`,
    `- Only discuss golf trip planning, courses, hotels, restaurants, and logistics relevant to this journey.`,
    `- Do not discuss anything harmful, adult, political, dangerous, or outside the scope of golf trip planning.`,
    `- If asked about something off-topic, politely redirect to the journey.`,
    `- Do not claim to be searching the internet. Use journey data first, general knowledge second.`,
    `- Never discuss specific tee time transactions or act as a booking agent.`,
    `- Keep responses concise and practical.`,
    ``,
    `Output valid JSON only:`,
    `{"assistantContent":"...","followUpOptions":[]}`,
    `followUpOptions is an optional array of short suggested follow-up questions (max 3, strings).`,
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? "").trim();
    const content = String(body?.content ?? "").trim();
    const messages: Array<{ role: "user" | "assistant"; content: string }> =
      Array.isArray(body?.messages) ? body.messages : [];

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

    const journey = await getPublishedJourneyBySlug(slug);
    if (!journey) return NextResponse.json({ error: "Journey not found" }, { status: 404 });

    const system = buildSystemPrompt(journey);

    const historyLines = messages
      .slice(-14)
      .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
      .join("\n");

    const input = [
      `SYSTEM:\n${system}`,
      historyLines ? `HISTORY:\n${historyLines}` : "",
      `USER_NOW: ${content}`,
      ``,
      `Return JSON only: {"assistantContent":"...","followUpOptions":[]}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const openai = getOpenAI();
    const resp = await openai.responses.create({ model: "gpt-4o-mini", input });

    const raw = stripJsonFences((resp as any)?.output_text?.trim() ?? "");
    let assistantContent = "";
    let followUpOptions: string[] = [];

    try {
      const parsed = JSON.parse(raw);
      assistantContent = String(parsed?.assistantContent ?? "").trim();
      followUpOptions = Array.isArray(parsed?.followUpOptions) ? parsed.followUpOptions : [];
    } catch {
      assistantContent = raw || "I'm not sure I understood — can you rephrase that?";
    }

    if (!assistantContent) assistantContent = "I'm not sure I understood — can you rephrase that?";

    return NextResponse.json({
      assistantMessage: {
        id: `asst_${Date.now()}`,
        role: "assistant",
        content: assistantContent,
        followUpOptions,
        created_at: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
