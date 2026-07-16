import type pg from "pg";
import { Resend } from "resend";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

/**
 * Shared email mechanics. Before this, app/api/share/route.ts and
 * app/api/plan/share/email/route.ts each carried their own copy of the Resend
 * client, the FROM default, isValidEmail, escapeHtml, the IP sniff, and the
 * share_log rate-limit block. The club invite would have been the third.
 *
 * The two older routes' HTML bodies are deliberately NOT collapsed into
 * emailShell() — they diverge (hero image + meta pills vs. destination rows) and
 * there's no visual test to catch a regression. They use the mechanics here; the
 * shell is for new templates.
 */

/**
 * Defaults to Resend's sandbox sender, which ONLY delivers to the Resend account
 * owner. If SHARE_FROM_EMAIL is unset in prod, every invite silently reaches
 * nobody — see assertDeliverableSender().
 */
export const FROM = process.env.SHARE_FROM_EMAIL || "onboarding@resend.dev";

const SANDBOX_FROM = "onboarding@resend.dev";

export function getResend(): Resend {
  return new Resend(process.env.RESEND_API_KEY);
}

/** True when mail can only reach the Resend account owner. */
export function isSandboxSender(): boolean {
  return FROM === SANDBOX_FROM;
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

/** Best-effort client IP for rate limiting. */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** True when this IP is over the hourly send budget. */
export async function isRateLimited(pool: pg.Pool, ip: string, limit: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM share_log WHERE ip = $1 AND created_at > now() - interval '1 hour'`,
    [ip]
  );
  return parseInt(rows[0].cnt, 10) >= limit;
}

export async function logSend(pool: pg.Pool, ip: string): Promise<void> {
  await pool.query(`INSERT INTO share_log (ip) VALUES ($1)`, [ip]);
}

/**
 * Standard shell: dark GTI header bar, white card, muted footer. Takes
 * PRE-ESCAPED html for bodyHtml — callers escape their own interpolations.
 */
export function emailShell(opts: {
  title: string;
  bodyHtml: string;
  /** Small right-aligned label in the header bar, e.g. "Club invite". */
  eyebrow?: string;
  footerNote?: string;
}): string {
  const { title, bodyHtml, eyebrow, footerNote } = opts;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Inter',system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
      <tr><td style="background:#0b0f1a;padding:18px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><a href="${SITE_URL}" style="color:#fff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;">${SITE_NAME}</a></td>
          ${eyebrow ? `<td align="right"><span style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(eyebrow)}</span></td>` : ""}
        </tr></table>
      </td></tr>
      <tr><td style="padding:30px 32px 26px;">${bodyHtml}</td></tr>
      <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e9edf3;">
        <p style="margin:0;font-size:11px;color:#a0aab8;line-height:1.5;">${
          footerNote ?? `Sent via <a href="${SITE_URL}" style="color:#a0aab8;">${SITE_NAME}</a>.`
        }</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#0488db;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:8px;">${escapeHtml(
    label
  )} &rarr;</a>`;
}

export type SendResult = {
  sent: number;
  failed: number;
  /** Resend message ids for successful sends, in recipient order. */
  ids: string[];
  /** Human-readable reasons for the failures, for logging/response. */
  errors: string[];
};

/**
 * Send one message per recipient so they never see each other's addresses.
 * Partial success is not failure — callers decide what a zero-send means.
 *
 * IMPORTANT: the Resend SDK does NOT throw on API errors. Its return type is
 *   { data: T, error: null } | { data: null, error: ErrorResponse }
 * so a rejected send RESOLVES with an error payload. Counting fulfilled promises
 * as successes therefore reports failures as sends — which is exactly what this
 * code (and the two share routes it was extracted from) used to do. A promise
 * only rejects on a transport-level fault, so BOTH the rejection and the
 * resolved `error` have to be checked.
 */
export async function sendEmails(
  recipients: string[],
  msg: { subject: string; html: string; text: string }
): Promise<SendResult> {
  const resend = getResend();
  const results = await Promise.allSettled(
    recipients.map((to) => resend.emails.send({ from: FROM, to, ...msg }))
  );

  const ids: string[] = [];
  const errors: string[] = [];
  results.forEach((r, i) => {
    const to = recipients[i];
    if (r.status === "rejected") {
      errors.push(`${to}: ${r.reason}`);
      console.error("[email] transport failure:", to, r.reason);
      return;
    }
    if (r.value.error) {
      errors.push(`${to}: ${r.value.error.message}`);
      console.error("[email] resend rejected:", to, r.value.error);
      return;
    }
    if (r.value.data?.id) ids.push(r.value.data.id);
    console.log("[email] sent:", to, r.value.data?.id);
  });

  return { sent: ids.length, failed: errors.length, ids, errors };
}
