import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedTripsWithFirstCourse } from "@/lib/airtable";
import { REGIONS, getFilterMeta, filterTrips } from "@/lib/filters";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import TripsListClient from "@/components/TripsListClient";
import styles from "@/styles/trips.module.css";

export const revalidate = 86400;

const SEO_FILTER_TYPES = ["region"] as const;
type SeoFilterType = (typeof SEO_FILTER_TYPES)[number];

function isSeoFilterType(t: string): t is SeoFilterType {
  return SEO_FILTER_TYPES.includes(t as SeoFilterType);
}

export async function generateStaticParams() {
  const params: { slug: string; filterValue: string }[] = [];
  for (const r of REGIONS) params.push({ slug: "region", filterValue: r.slug });
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; filterValue: string }>;
}): Promise<Metadata> {
  const { slug: filterType, filterValue } = await params;
  if (!isSeoFilterType(filterType)) return {};

  const meta = getFilterMeta(filterType, filterValue);
  if (!meta) return {};

  const url = `${SITE_URL}/trips/${filterType}/${filterValue}`;

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.description,
    },
  };
}

export default async function TripFilterPage({
  params,
}: {
  params: Promise<{ slug: string; filterValue: string }>;
}) {
  const { slug: filterType, filterValue } = await params;

  if (!isSeoFilterType(filterType)) {
    redirect(`/trips?${filterType}=${filterValue}`);
  }

  const meta = getFilterMeta(filterType, filterValue);
  if (!meta) return notFound();

  const allTrips = await getPublishedTripsWithFirstCourse();
  const rawFiltered = filterTrips(allTrips, filterType, filterValue).sort(
    (a, b) => (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999)
  );

  // Strip large text fields not needed for the list view
  const filtered = rawFiltered.map(({ id, slug, name, secondaryName, currentRanking, previousRanking,
    durationMinDays, durationMaxDays, driving, stayType, leadTime, costTier, overview,
    golfRating, lodgingRating, foodRating, vibeRating, overallRating,
    region, state, seasons, top100Count, firstCourse }) => ({
    id, slug, name, secondaryName, currentRanking, previousRanking,
    durationMinDays, durationMaxDays, driving, stayType, leadTime, costTier, overview,
    golfRating, lodgingRating, foodRating, vibeRating, overallRating,
    region: region ?? undefined,
    state: state ?? undefined,
    seasons: seasons ?? undefined,
    top100Count,
    firstCourse: firstCourse ? { slug: firstCourse.slug } : undefined,
  }));

  const regionDef = filterType === "region"
    ? REGIONS.find((r) => r.slug === filterValue)
    : null;

  return (
    <main className={styles.page}>
      <section className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true" />
        <div className={styles.bannerPanel}>
          <h1 className={styles.bannerTitle}>{meta.heading}</h1>
          <div className={styles.bannerSub}>{meta.description}</div>
        </div>
      </section>

      <section className={styles.listWrap}>
        <div className={styles.listInner}>
          {filtered.length > 0 ? (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#6b7280", marginBottom: 16 }}>
                {filtered.length} Ranked {regionDef ? `${regionDef.label} ` : ""}Golf Trips
              </h2>
              <Suspense fallback={null}>
                <TripsListClient trips={filtered} pageSize={20} />
              </Suspense>
              {regionDef && (
                <div style={{ marginTop: 56, borderTop: "1px solid #e5e7eb", paddingTop: 40 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0b0f1a", marginBottom: 12 }}>
                    Planning a {regionDef.label} Golf Trip
                  </h2>
                  <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, maxWidth: 680, marginBottom: 32 }}>
                    The rankings above reflect Golf Trip Index&apos;s independent scoring across courses, lodging, food, and overall experience. Use the filters to narrow by budget, duration, or stay type.
                  </p>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0b0f1a", marginBottom: 12 }}>
                    How These Rankings Work
                  </h2>
                  <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, maxWidth: 680 }}>
                    Every trip is scored on four dimensions: Golf (course quality and architecture), Lodging (group suitability and value), Food (on-course and nearby dining), and Vibe (pace, caddies, and travel complexity). The overall score weights golf most heavily while accounting for the full trip experience.{" "}
                    <Link href="/how-we-rate" style={{ color: "#0b0f1a", fontWeight: 600 }}>Learn more about the methodology →</Link>
                  </p>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: "40px 0", color: "#6b7280", fontSize: 15 }}>
              <p>No trips match this filter yet.</p>
              <p style={{ marginTop: 8 }}>
                <Link href="/trips" style={{ color: "#111", fontWeight: 600 }}>
                  View all trips →
                </Link>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
