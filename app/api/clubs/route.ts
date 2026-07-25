import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { SITE_URL } from "@/lib/seo";
import { createClub } from "@/lib/clubs";

/**
 * Create a club with the signed-in user as its owner.
 *
 * See lib/clubs.createClub for the billing caveat: the schema treats a club as a
 * paid object, and this self-serve route provisions one for free for now.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to start a club." }, { status: 401 });
  }
  if (!session.user.email) {
    // Every provider populates email; this is a guard, not an expected path.
    return NextResponse.json({ error: "Your account is missing an email. Contact support." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const homeCourse = body?.homeCourse ? String(body.homeCourse).trim().slice(0, 120) : null;

  try {
    const result = await createClub({
      ownerId: session.user.id,
      ownerEmail: session.user.email,
      name: name.slice(0, 80),
      homeCourse,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { slug: result.slug, url: `${SITE_URL}/clubs/${result.slug}` },
      { status: 201 }
    );
  } catch (err) {
    console.error("[clubs] create error:", err);
    return NextResponse.json({ error: "Could not create the club. Try again." }, { status: 500 });
  }
}
