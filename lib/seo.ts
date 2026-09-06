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

/**
 * The keyword half of a trip page's visible H1.
 *
 * `tripReviewTitle` builds the SERP title around "<name> golf trip review",
 * but the hero used to render the bare destination name — so the phrase the
 * title targets never appeared on the page itself. This returns the qualifier
 * to append after the destination, trimmed to whatever the name doesn't
 * already carry.
 */
export function tripHeadingQualifier(name: string): string {
  const trimmed = name.trim();
  if (/\bgolf trips?\s+review$/i.test(trimmed)) return "";
  if (/\bgolf trips?$/i.test(trimmed)) return " Review";
  return " Golf Trip Review";
}

/**
 * JSON-LD for a trip page: plain page/entity description, no review markup.
 *
 * This used to emit `Review` + `itemReviewed: TouristAttraction`, but Google
 * doesn't recognize `TouristAttraction` as a valid `itemReviewed` type for
 * Review rich results, so Search Console flagged every trip page as an
 * invalid review snippet. `TouristAttraction` is also the accurate type for
 * a golf trip — it isn't a `Product` or `LocalBusiness` — so rather than
 * force-fitting a type Google's review validator accepts, this drops the
 * review/rating markup entirely and keeps the `TouristAttraction` as the
 * subject of a plain `WebPage`, via `about` rather than `itemReviewed`. The
 * 0–10 score itself still renders on the page; it's just no longer asserted
 * as a rich-result `reviewRating`.
 *
 * Shared by /trips/[slug] and its noindexed /design-trip/[slug] twin so the
 * two templates cannot drift back apart.
 */
export function tripWebPageSchema(trip: {
  slug: string;
  name: string;
  overallRating?: number;
  verdict?: string;
  overview?: string;
  fullDescription?: string;
}) {
  const url = `${SITE_URL}/trips/${trip.slug}`;
  const publisher = {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/logo-gti.png`,
    },
  };
  const description = trip.verdict || trip.overview || trip.fullDescription || undefined;

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: tripReviewTitle(trip.name, trip.overallRating),
    ...(description ? { description } : {}),
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    about: {
      "@type": "TouristAttraction",
      "@id": `${url}#trip`,
      name: `${trip.name} Golf Trip`,
      description: trip.overview ?? trip.fullDescription ?? undefined,
      url,
      image: `${SITE_URL}/images/trips/${trip.slug}.jpg`,
    },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: `${SITE_URL}/images/trips/${trip.slug}.jpg`,
    },
    publisher,
  };
}

/**
 * Canonical URL path for a head-to-head matchup.
 *
 * `/compare/[[...matchup]]` accepts both `/compare/A/B` and `/compare/A-vs-B`,
 * in either order — four URLs per pairing. Sorting the slugs collapses them to
 * one canonical target, which matters at ~4,950 possible pairings.
 */
export function matchupPath(a: string, b: string): string {
  return `/compare/${[a, b].sort().join("-vs-")}`;
}

/** H1 and SERP title for a matchup page. */
export function matchupTitle(nameA: string, nameB: string): string {
  return `${nameA} vs ${nameB} - Golf Trip Comparison`;
}

/**
 * The standfirst under the matchup H1, and its meta description.
 *
 * Server-rendered, so a crawler arriving before the generated comparison has
 * run still gets a page that says what the matchup is and what it covers.
 */
export function matchupIntro(nameA: string, nameB: string): string {
  return `Comparing ${nameA} and ${nameB} on golf, lodging, food and drinks, other activities, vibe, cost and logistics. Who wins?`;
}
