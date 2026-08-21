export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.golftripindex.com";

export const SITE_NAME = "Golf Trip Index";

/**
 * SERP title for a trip review page.
 *
 * Rendered with `title: { absolute }` so the root layout's
 * "%s | Golf Trip Index" template does NOT append the brand — the suffix
 * costs 18 characters and pushes the longest trip names past Google's
 * ~60-character display limit. The rating is the differentiator instead.
 */
export function tripReviewTitle(name: string, overallRating?: number): string {
  const base = `${name} Golf Trip Review`;
  if (!overallRating || overallRating <= 0) return base;
  return `${base} (${overallRating.toFixed(1)}/10)`;
}
