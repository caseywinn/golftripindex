import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedTripsWithFirstCourse } from "@/lib/airtable";
import {
  REGIONS,
  COST_TIERS,
  DURATION_RANGES,
  TRIP_TYPES,
  SEASONS,
  TOP_100_COUNTS,
  slugifyState,
  getFilterMeta,
  filterTrips,
} from "@/lib/filters";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import TripFilters from "@/components/TripFilters";
import TripsListClient from "@/components/TripsListClient";
import styles from "@/styles/trips.module.css";

export const revalidate = 86400;

export async function generateStaticParams() {
  const trips = await getPublishedTripsWithFirstCourse();

  const params: { slug: string; filterValue: string }[] = [];

  for (const r of REGIONS) params.push({ slug: "region", filterValue: r.slug });
  for (const c of COST_TIERS) params.push({ slug: "cost", filterValue: c.slug });
  for (const d of DURATION_RANGES) params.push({ slug: "duration", filterValue: d.slug });
  for (const t of TRIP_TYPES) params.push({ slug: "type", filterValue: t.slug });
  for (const s of SEASONS) params.push({ slug: "season", filterValue: s.slug });
  for (const n of TOP_100_COUNTS) params.push({ slug: "top100", filterValue: n.slug });

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
          <TripFilters activeType={filterType} activeValue={filterValue} />

          {filtered.length > 0 ? (
            <TripsListClient trips={filtered} pageSize={20} />
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
