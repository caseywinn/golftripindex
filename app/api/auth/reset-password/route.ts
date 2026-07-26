import { NextResponse } from "next/server";
import { consumeResetToken, MIN_PASSWORD_LENGTH } from "@/lib/passwordReset";

/**
 * Spend a reset link and set the new password.
 *
 * Unlike the request route, this one CAN be specific: the caller already holds a
 * 32-byte token, so telling them it expired leaks nothing they couldn't learn by
 * trying. Vague errors here just strand people on a dead link with no idea to
 * ask for a fresh one.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "");
  const password = String(body?.password ?? "");

  if (!token) {
    return NextResponse.json({ error: "This reset link is missing its token." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }

  try {
    const result = await consumeResetToken(token, password);
    if (result.ok) return NextResponse.json({ ok: true });

    const message =
      result.reason === "expired"
        ? "This reset link has expired. Request a new one."
        : result.reason === "used"
          ? "This reset link has already been used. Request a new one."
          : result.reason === "short"
            ? `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`
            : "This reset link isn't valid. Request a new one.";
    return NextResponse.json({ error: message, reason: result.reason }, { status: 400 });
  } catch (err) {
    console.error("[auth/reset-password] error:", err);
    return NextResponse.json(
      { error: "Could not reset your password. Try again." },
      { status: 500 }
    );
  }
}
