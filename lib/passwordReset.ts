import crypto from "node:crypto";
import type pg from "pg";
import bcrypt from "bcryptjs";
import { getPgPool } from "@/lib/db";
import { SITE_URL } from "@/lib/seo";
import { emailShell, emailButton, escapeHtml, sendEmails } from "@/lib/email";

/**
 * Password reset tokens. See migrations/add_password_resets.sql for the table
 * and why only the hash is stored.
 *
 * The whole flow is written to leak nothing about which addresses have accounts:
 * the request route answers identically whether or not the email matched, so
 * every enumeration signal has to be kept out of *this* layer too — no throwing
 * "no such user", no different timing branch that a caller could surface.
 */

/** How long an emailed link stays good. Short: it arrives in seconds. */
const TTL_MINUTES = 60;

/** Cost factor, matching the register route so hashes are uniform. */
const BCRYPT_ROUNDS = 12;

/** Minimum password length, matching /api/auth/register. */
export const MIN_PASSWORD_LENGTH = 8;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a reset token for a user and return the RAW token — the only moment it
 * exists in plaintext. Any outstanding tokens for that user are burned first, so
 * requesting a second link invalidates the first rather than leaving two live
 * doors open.
 */
export async function createResetToken(userId: string, poolArg?: pg.Pool): Promise<string> {
  const pool = poolArg ?? getPgPool();
  const token = crypto.randomBytes(32).toString("base64url");

  await pool.query(
    `UPDATE password_resets SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [userId, hashToken(token), String(TTL_MINUTES)]
  );

  return token;
}

/**
 * Burn every outstanding link for a user. Called when the password changes by
 * some other route (the My Bag card), so a reset link mailed out just before
 * that can't be clicked afterwards to undo it.
 */
export async function invalidateResetTokens(userId: string, poolArg?: pg.Pool): Promise<void> {
  const pool = poolArg ?? getPgPool();
  await pool.query(
    `UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
}

export type ResetOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "used" | "short" };

/**
 * Spend a reset token: verify it, then set the new password in the same
 * transaction so a token can never be consumed without the password actually
 * changing (or vice versa). The row is locked FOR UPDATE, which is what stops
 * two simultaneous clicks on the same link from both passing the used_at check.
 *
 * Setting a password on an OAuth-only row is allowed on purpose — the golfer
 * proved control of the address by clicking the emailed link, which is exactly
 * the evidence a password grant needs, and it gives Google users a way back in
 * if they ever lose that Google account.
 */
export async function consumeResetToken(
  token: string,
  newPassword: string,
  poolArg?: pg.Pool
): Promise<ResetOutcome> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "short" };

  const pool = poolArg ?? getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, user_id, expires_at, used_at
       FROM password_resets
       WHERE token_hash = $1
       FOR UPDATE`,
      [hashToken(token)]
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "invalid" };
    }
    if (row.used_at) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "used" };
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "expired" };
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await client.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [row.user_id, hash]);
    await client.query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [row.id]);
    // Any other link mailed to this golfer is stale the moment one is spent.
    await client.query(
      `UPDATE password_resets SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL`,
      [row.user_id]
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** The reset email. Sent only to an address that already has an account. */
export async function sendResetEmail(opts: {
  to: string;
  name: string | null;
  token: string;
  /** True when the account signs in with Google and has no password yet. */
  oauthOnly: boolean;
}): Promise<void> {
  const { to, name, token, oauthOnly } = opts;
  const link = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";

  // A Google-only golfer who lands here probably forgot they never had a
  // password. Say so, but still give them the link — it sets one, and that is a
  // legitimate way back in if the Google account is gone.
  const lead = oauthOnly
    ? `You usually sign in to ${escapeHtml("Golf Trip Index")} with Google, so there's no password on your account yet. If you'd like one — or you've lost access to that Google account — use the link below to set it.`
    : `Somebody asked to reset the password on your Golf Trip Index account. Use the link below to pick a new one.`;

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;color:#0b0f1a;">${greeting}</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3c4757;">${lead}</p>
    <p style="margin:0 0 22px;">${emailButton(link, oauthOnly ? "Set a password" : "Reset password")}</p>
    <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#64748b;">
      This link expires in ${TTL_MINUTES} minutes and can only be used once.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
      Didn't ask for this? Ignore this email — nothing changes until the link is used.
    </p>`;

  const text = [
    greeting.replace(/&#39;/g, "'"),
    "",
    oauthOnly
      ? "You sign in to Golf Trip Index with Google and have no password yet. Set one here:"
      : "Somebody asked to reset the password on your Golf Trip Index account. Pick a new one here:",
    link,
    "",
    `This link expires in ${TTL_MINUTES} minutes and can only be used once.`,
    "Didn't ask for this? Ignore this email — nothing changes until the link is used.",
  ].join("\n");

  const result = await sendEmails([to], {
    subject: oauthOnly ? "Set your Golf Trip Index password" : "Reset your Golf Trip Index password",
    html: emailShell({ title: "Reset your password", bodyHtml, eyebrow: "Password reset" }),
    text,
  });

  // The request route always answers "check your email", so a dead send would
  // otherwise be completely invisible. Surface it in the logs at least.
  if (result.sent === 0) {
    console.error("[passwordReset] reset email not delivered", { errors: result.errors });
  }
}
