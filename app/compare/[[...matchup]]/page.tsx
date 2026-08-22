import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import CompareClient from "../CompareClient";
import { getPublishedTrips } from "@/lib/airtable";
import {
  SITE_URL,
  SITE_NAME,
  matchupPath,
  matchupTitle,
  matchupIntro,
} from "@/lib/seo";

/**
 * Matched to the trip templates. The page body is a client-side generation, so
 * everything rendered here — H1, standfirst, metadata — is stable for a day,
 * and caching it removes the Airtable read from the request path. It also
 * replaces what `loading.tsx` used to cover: that fallback was the only thing
 * a crawler received, so the route now renders in document order instead.
 */
export const revalidate = 86400;

const BASE_DESCRIPTION =
  "Compare two golf trips side-by-side with AI-powered analysis of courses, ratings, cost, and overall experience.";

/**
 * slug → published trip name.
 *
 * `cache()` dedupes the Airtable read across generateMetadata and the render
 * pass of the same request, so resolving a matchup costs one fetch, not two.
 */
const tripNames = cache(async (): Promise<Map<string, string>> => {
  const trips = await getPublishedTrips();
  return new Map(trips.map((t) => [t.slug, t.name]));
});

type Matchup = { A: string; B: string; nameA: string; nameB: string };

/**
 * Resolve URL params to a real, published, canonically-ordered pair.
 *
 * Returns null when the URL names no valid matchup — either it didn't parse or
 * one of the slugs isn't a published trip. Order is normalised to match
 * `matchupPath`, so `/compare/b-vs-a` and `/compare/a-vs-b` render the same
 * page as well as sharing the same canonical.
 */
async function resolveMatchup(matchup?: string[]): Promise<Matchup | null> {
  const pair = parseFromParams(matchup);
  if (!pair) return null;

  const [A, B] = [pair.A, pair.B].sort();
  const names = await tripNames();
  const nameA = names.get(A);
  const nameB = names.get(B);
  if (!nameA || !nameB) return null;

  return { A, B, nameA, nameB };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchup?: string[] }>;
}): Promise<Metadata> {
  const { matchup } = await params;
  const pair = await resolveMatchup(matchup);

  const canonical = pair
    ? `${SITE_URL}${matchupPath(pair.A, pair.B)}`
    : `${SITE_URL}/compare`;
  const title = pair
    ? matchupTitle(pair.nameA, pair.nameB)
    : "Compare Golf Trips";
  const description = pair
    ? matchupIntro(pair.nameA, pair.nameB)
    : BASE_DESCRIPTION;

  return {
    // Matchup titles already carry the brand's job; the root layout's
    // "%s | Golf Trip Index" suffix would push them past ~60 characters.
    title: pair ? { absolute: title } : title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

function parseFromParams(matchup?: string[]): { A: string; B: string } | null {
  if (!matchup || matchup.length === 0) return null;

  // /compare/A/B
  if (matchup.length >= 2) {
    const A = decodeURIComponent(matchup[0] ?? "").trim();
    const B = decodeURIComponent(matchup[1] ?? "").trim();
    if (!A || !B || A === B) return null;
    return { A, B };
  }

  // /compare/A-vs-B
  const raw = matchup[0];
  if (!raw) return null;

  const parts = raw.split("-vs-");
  if (parts.length !== 2) return null;

  const A = decodeURIComponent(parts[0] ?? "").trim();
  const B = decodeURIComponent(parts[1] ?? "").trim();
  if (!A || !B || A === B) return null;

  return { A, B };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ matchup?: string[] }>;
}) {
  const { matchup } = await params;

  // A URL that carries a matchup but doesn't resolve to two published trips is
  // not a page. 404 it rather than serving the generic picker at an indexable
  // URL — otherwise every typo'd slug is a soft-duplicate of /compare.
  if (matchup && matchup.length > 0) {
    const pair = await resolveMatchup(matchup);
    if (!pair) notFound();

    return (
      <CompareClient
        initialA={pair.A}
        initialB={pair.B}
        initialNameA={pair.nameA}
        initialNameB={pair.nameB}
      />
    );
  }

  return <CompareClient initialA="" initialB="" />;
}
