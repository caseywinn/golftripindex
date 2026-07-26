import { NextResponse } from "next/server";
import { getPgPool } from "@/lib/db";
import { getClientIp, isRateLimited, isValidEmail, logSend } from "@/lib/email";
import { createResetToken, sendResetEmail } from "@/lib/passwordReset";

/**
 * Request a password reset link.
 *
 * The response is ALWAYS the same generic { ok: true } — a 404 for unknown
 * addresses would turn this endpoint into a "does this golfer have an account"
 * oracle, which is the classic enumeration leak on a forgot-password form. That
 * also means real failures (no such user, dead mail send) are logged, never
 * returned.
 *
 * Rate limited by IP against share_log, the same bucket the share/invite mails
 * use, so this can't be turned into a free mail cannon aimed at somebody else's
 * inbox.
 */
const HOURLY_LIMIT = 10;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    // The one shape that isn't generic: a malformed address is a client bug, not
    // information about who has an account.
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const pool = getPgPool();
  const ip = getClientIp(req);

  try {
    if (await isRateLimited(pool, ip, HOURLY_LIMIT)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in an hour." },
        { status: 429 }
      );
    }

    const { rows } = await pool.query(
      `SELECT id, name, email, password_hash FROM users WHERE email = $1`,
      [email]
    );
    const user = rows[0];

    // Logged for every attempt, matched or not. Charging only the sends would
    // let somebody sweep a list of addresses for free and learn which ones
    // eventually trip the limit — the enumeration leak coming back in through
    // the rate limiter.
    await logSend(pool, ip);

    if (user) {
      const token = await createResetToken(String(user.id), pool);
      await sendResetEmail({
        to: user.email,
        name: user.name || null,
        token,
        oauthOnly: !user.password_hash,
      });
    } else {
      console.warn("[auth/forgot-password] no account for requested address");
    }
  } catch (err) {
    // Still answer ok: an error here is ours, and differentiating it would hand
    // back the same signal the generic response exists to hide.
    console.error("[auth/forgot-password] error:", err);
  }

  return NextResponse.json({ ok: true });
}
