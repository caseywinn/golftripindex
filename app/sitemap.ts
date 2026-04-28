import type { MetadataRoute } from "next";
import {
  getPublishedTrips,
  getPublishedJourneys,
  getPublishedArticles,
} from "@/lib/airtable";
import { SITE_URL } from "@/lib/seo";
import {
  REGIONS,
  COST_TIERS,
  DURATION_RANGES,
  TRIP_TYPES,
  SEASONS,
  slugifyState,
} from "@/lib/filters";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [trips, journeys, articles] = await Promise.all([
    getPublishedTrips(),
    getPublishedJourneys(),
    getPublishedArticles(),
  ]);

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/trips`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/journeys`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/courses`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/how-we-rate`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/trips/top-100`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];

  const filterPages: MetadataRoute.Sitemap = [
    ...REGIONS.map((r) => ({
      url: `${SITE_URL}/trips/region/${r.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...COST_TIERS.map((c) => ({
      url: `${SITE_URL}/trips/cost/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...DURATION_RANGES.map((d) => ({
      url: `${SITE_URL}/trips/duration/${d.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...TRIP_TYPES.map((t) => ({
      url: `${SITE_URL}/trips/type/${t.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...SEASONS.map((s) => ({
      url: `${SITE_URL}/trips/season/${s.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];

  // State filter pages — built dynamically from trip data
  const stateSet = new Set<string>();
  for (const t of trips) {
    if (t.state) stateSet.add(slugifyState(t.state));
  }
  const statePages: MetadataRoute.Sitemap = Array.from(stateSet)
    .filter(Boolean)
    .map((s) => ({
      url: `${SITE_URL}/trips/state/${s}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const tripPages: MetadataRoute.Sitemap = trips.map((t) => ({
    url: `${SITE_URL}/trips/${t.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const articlePages: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE_URL}/articles/${a.slug}`,
    lastModified: a.publishedOn ? new Date(a.publishedOn) : now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const journeyPages: MetadataRoute.Sitemap = journeys.map((j) => ({
    url: `${SITE_URL}/journeys/${j.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    ...staticPages,
    ...filterPages,
    ...statePages,
    ...tripPages,
    ...articlePages,
    ...journeyPages,
  ];
}
