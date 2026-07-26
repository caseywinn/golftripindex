import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getPasswordHash, setPasswordHash } from "@/lib/users";
import { MIN_PASSWORD_LENGTH, invalidateResetTokens } from "@/lib/passwordReset";

/**
 * Change the signed-in golfer's password from the My Bag page.
 *
 * Requires the current password even though there's already a valid session:
 * a session cookie is not proof of possession, and without this check a borrowed
 * laptop is a permanent account takeover. Google-only accounts (NULL
 * password_hash) are refused here rather than allowed to set a first password —
 * there is nothing to verify against, so that path goes through the emailed
 * reset link instead.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to change your password." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Fill in both password fields." }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "That's the password you already have. Pick a different one." },
      { status: 400 }
    );
  }

  try {
    const pool = getPgPool();
    const hash = await getPasswordHash(session.user.id, pool);
    if (!hash) {
      return NextResponse.json(
        { error: "This account signs in with Google, so it has no password to change." },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(currentPassword, hash);
    if (!valid) {
      return NextResponse.json({ error: "That current password isn't right." }, { status: 400 });
    }

    await setPasswordHash(session.user.id, await bcrypt.hash(newPassword, 12), pool);
    // A reset link mailed out moments ago must not survive a deliberate change.
    await invalidateResetTokens(session.user.id, pool);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[user/password] change error:", err);
    return NextResponse.json(
      { error: "Could not change your password. Try again." },
      { status: 500 }
    );
  }
}
