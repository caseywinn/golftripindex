/**
 * End-to-end check of the password reset + change paths against the real
 * database. Run: npm run verify:password
 *
 * Every state transition here goes through the shipped functions
 * (createResetToken / consumeResetToken / invalidateResetTokens / bcrypt +
 * setPasswordHash) rather than hand-written SQL. A test that INSERTs its own
 * "used" row proves the assertion, not the code — the only thing worth checking
 * is that the real call sites produce the state.
 *
 * Creates and deletes its own throwaway users; sends no email.
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { getPgPool } from "../lib/db";
import {
  createResetToken,
  consumeResetToken,
  invalidateResetTokens,
} from "../lib/passwordReset";
import { getPasswordHash, setPasswordHash, userHasPassword } from "../lib/users";

const pool = getPgPool();
let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function makeUser(email: string, password: string | null): Promise<string> {
  const hash = password ? await bcrypt.hash(password, 12) : null;
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    ["Verify Bot", email, hash]
  );
  return String(rows[0].id);
}

async function main() {
  const stamp = process.env.VERIFY_STAMP ?? String(process.pid);
  const emailA = `verify-reset-${stamp}-a@example.invalid`;
  const emailB = `verify-reset-${stamp}-b@example.invalid`;
  const created: string[] = [];

  try {
    // ── A password account resets to a new password ─────────────────────────
    console.log("\nreset flow (password account)");
    const userA = await makeUser(emailA, "old-password-1");
    created.push(userA);

    check("starts with a password", await userHasPassword(userA, pool));

    const token = await createResetToken(userA, pool);
    check("token is opaque and long", token.length >= 40, `len ${token.length}`);

    const stored = await pool.query(
      `SELECT token_hash FROM password_resets WHERE user_id = $1`,
      [userA]
    );
    check(
      "raw token is not stored",
      stored.rows.every((r) => r.token_hash !== token)
    );

    const first = await consumeResetToken(token, "brand-new-password", pool);
    check("token spends", first.ok, JSON.stringify(first));

    const hashAfter = await getPasswordHash(userA, pool);
    check("new password verifies", await bcrypt.compare("brand-new-password", hashAfter!));
    check("old password no longer verifies", !(await bcrypt.compare("old-password-1", hashAfter!)));

    // ── Replay, expiry, garbage, and too-short ──────────────────────────────
    console.log("\nrejections");
    const replay = await consumeResetToken(token, "another-password", pool);
    check("replay is refused", !replay.ok && replay.reason === "used", JSON.stringify(replay));

    const stillOld = await getPasswordHash(userA, pool);
    check("refused replay did not change the password", stillOld === hashAfter);

    const bogus = await consumeResetToken("not-a-real-token", "another-password", pool);
    check("unknown token is refused", !bogus.ok && bogus.reason === "invalid");

    const shortTok = await createResetToken(userA, pool);
    const short = await consumeResetToken(shortTok, "abc", pool);
    check("too-short password is refused", !short.ok && short.reason === "short");
    const afterShort = await consumeResetToken(shortTok, "long-enough-password", pool);
    check("token survives a rejected short password", afterShort.ok);

    // Expiry: age the row rather than sleeping an hour. This is the one place
    // the check touches SQL directly, and it moves the clock, not the outcome —
    // consumeResetToken still decides.
    const expTok = await createResetToken(userA, pool);
    await pool.query(
      `UPDATE password_resets SET expires_at = now() - interval '1 minute'
       WHERE user_id = $1 AND used_at IS NULL`,
      [userA]
    );
    const expired = await consumeResetToken(expTok, "yet-another-password", pool);
    check("expired token is refused", !expired.ok && expired.reason === "expired", JSON.stringify(expired));

    // ── Issuing a new link kills the outstanding one ────────────────────────
    console.log("\nsupersede + invalidate");
    const older = await createResetToken(userA, pool);
    const newer = await createResetToken(userA, pool);
    const olderResult = await consumeResetToken(older, "should-not-take", pool);
    check("older link dies when a newer one is issued", !olderResult.ok && olderResult.reason === "used");
    const newerResult = await consumeResetToken(newer, "newest-password-ok", pool);
    check("newest link still works", newerResult.ok, JSON.stringify(newerResult));

    // A deliberate change (the My Bag card) must burn pending links.
    const pending = await createResetToken(userA, pool);
    await setPasswordHash(userA, await bcrypt.hash("changed-from-my-bag", 12), pool);
    await invalidateResetTokens(userA, pool);
    const afterChange = await consumeResetToken(pending, "reset-after-change", pool);
    check(
      "pending link dies after a deliberate change",
      !afterChange.ok && afterChange.reason === "used",
      JSON.stringify(afterChange)
    );
    check(
      "the deliberate change is what stands",
      await bcrypt.compare("changed-from-my-bag", (await getPasswordHash(userA, pool))!)
    );

    // ── An OAuth-only account can be granted a password by link ─────────────
    console.log("\noauth-only account");
    const userB = await makeUser(emailB, null);
    created.push(userB);
    check("starts with no password", !(await userHasPassword(userB, pool)));

    const oauthTok = await createResetToken(userB, pool);
    const granted = await consumeResetToken(oauthTok, "first-password-ever", pool);
    check("link grants a first password", granted.ok, JSON.stringify(granted));
    check("account now has a password", await userHasPassword(userB, pool));
  } finally {
    if (created.length) {
      await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [created]);
    }
    await pool.end();
  }

  console.log(failures ? `\n${failures} check(s) failed\n` : "\nall checks passed\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
