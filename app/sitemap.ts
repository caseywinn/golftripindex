import type { MetadataRoute } from "next";
import {
  getPublishedTrips,
  getPublishedJourneys,
  getPublishedArticles,
} from "@/lib/airtable";
import { SITE_URL } from "@/lib/seo";
import { REGIONS } from "@/lib/filters";

export const revalidate = 86400;

// Keep in sync with the CATEGORIES map in app/articles/category/[category]/page.tsx
const ARTICLE_CATEGORIES = ["comparisons", "destinations", "trip-types", "planning"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [trips, journeys, articles] = await Promise.all([
    getPublishedTrips(),
    getPublishedJourneys(),
    getPublishedArticles(),
  ]);

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/trips`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/articles`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/journeys`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/courses`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/how-we-rate`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/golf-trip-cost-index`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    // /articles only previews three articles per category; /articles/all is the
    // paginated index that actually reaches every one of them.
    { url: `${SITE_URL}/articles/all`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ...ARTICLE_CATEGORIES.map((c) => ({
      url: `${SITE_URL}/articles/category/${c}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    // Unlinked from the main nav on purpose while the venue is unconfirmed, but
    // indexable: resorts we've emailed search for us before they reply.
    {
      url: `${SITE_URL}/events/father-son-invitational`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const filterPages: MetadataRoute.Sitemap = [
    ...REGIONS.map((r) => ({
      url: `${SITE_URL}/trips/region/${r.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];

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
    ...tripPages,
    ...articlePages,
    ...journeyPages,
  ];
}
