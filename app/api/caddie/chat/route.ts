import { NextResponse } from "next/server";
import { runUniversalTurn } from "@/lib/universalEngine";
import type { ContextType } from "@/lib/universalEngine";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const content = String(body?.content ?? "").trim();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const contextSlug = body?.contextSlug ? String(body.contextSlug).trim() : undefined;
    const contextType = (body?.contextType as ContextType) || undefined;

    if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

    const out = await runUniversalTurn({ content, messages, contextSlug, contextType });

    return NextResponse.json({
      assistantMessage: {
        id: `asst_${Date.now()}`,
        role: "assistant",
        content: out.assistantContent,
        followUpOptions: out.followUpOptions,
        created_at: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
