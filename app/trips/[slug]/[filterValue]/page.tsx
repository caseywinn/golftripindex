import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedTripsWithFirstCourse } from "@/lib/airtable";
import {
  REGIONS,
  slugifyState,
  getFilterMeta,
  filterTrips,
} from "@/lib/filters";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import TripsListClient from "@/components/TripsListClient";
import styles from "@/styles/trips.module.css";

export const revalidate = 86400;

const SEO_FILTER_TYPES = ["region", "state"] as const;
type SeoFilterType = (typeof SEO_FILTER_TYPES)[number];

function isSeoFilterType(t: string): t is SeoFilterType {
  return SEO_FILTER_TYPES.includes(t as SeoFilterType);
}

export async function generateStaticParams() {
  const trips = await getPublishedTripsWithFirstCourse();
  const params: { slug: string; filterValue: string }[] = [];

  for (const r of REGIONS) params.push({ slug: "region", filterValue: r.slug });

  const states = new Set<string>();
  for (const t of trips) {
    if (t.state) states.add(slugifyState(t.state));
  }
  for (const s of states) {
    if (s) params.push({ slug: "state", filterValue: s });
  }

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
  const filtered = filterTrips(allTrips, filterType, filterValue).sort(
    (a, b) => (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999)
  );

  return (
    <main className={styles.page}>
      <section className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true" />
        <div className={styles.bannerPanel}>
          <div className={styles.bannerTitle}>{meta.heading}</div>
          <div className={styles.bannerSub}>{meta.description}</div>
        </div>
      </section>

      <section className={styles.listWrap}>
        <div className={styles.listInner}>
          {filtered.length > 0 ? (
            <Suspense fallback={null}>
              <TripsListClient trips={filtered} pageSize={20} />
            </Suspense>
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
