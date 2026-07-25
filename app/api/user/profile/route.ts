import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateUserProfile } from "@/lib/users";

/**
 * Edit the signed-in user's profile fields (Handle, handicap, favourite trip).
 * The Handle is users.name, so it also updates everywhere the name is shown.
 *
 * Email (the login) is deliberately not editable here — changing it would move
 * the account-linking key that ties Google and password sign-ins to one row.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to edit your profile." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const name = String(body?.name ?? "").trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "Add a handle so your buddies know who you are." }, { status: 400 });
  }

  const handicap = body?.handicap ? String(body.handicap).trim().slice(0, 12) || null : null;
  const favoriteTrip = body?.favoriteTrip ? String(body.favoriteTrip).trim().slice(0, 120) || null : null;

  try {
    await updateUserProfile(session.user.id, { name, handicap, favoriteTrip });
    // Echo the saved name back so the client can push it into the session.
    return NextResponse.json({ ok: true, name });
  } catch (err) {
    console.error("[user/profile] update error:", err);
    return NextResponse.json({ error: "Could not save your profile. Try again." }, { status: 500 });
  }
}
