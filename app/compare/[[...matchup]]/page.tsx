import type { Metadata } from "next";
import CompareClient from "../CompareClient";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

const BASE_DESCRIPTION =
  "Compare two golf trips side-by-side with AI-powered analysis of courses, ratings, cost, and overall experience.";

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params,
}: {
  params: { matchup?: string[] };
}): Promise<Metadata> {
  const matchup = params?.matchup;
  const canonical =
    matchup && matchup.length > 0
      ? `${SITE_URL}/compare/${matchup.join("/")}`
      : `${SITE_URL}/compare`;

  const pair = parseFromParams(matchup);
  const title = pair
    ? `${slugToTitle(pair.A)} vs. ${slugToTitle(pair.B)}`
    : "Compare Golf Trips";
  const description = pair
    ? `Compare ${slugToTitle(pair.A)} and ${slugToTitle(pair.B)} side-by-side — courses, ratings, cost, and overall experience.`
    : BASE_DESCRIPTION;

  return {
    title,
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

export default function ComparePage({
  params,
}: {
  params: { matchup?: string[] };
}) {
  const parsed = parseFromParams(params?.matchup);

  return (
    <CompareClient
      initialA={parsed?.A ?? ""}
      initialB={parsed?.B ?? ""}
    />
  );
}