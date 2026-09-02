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

  // No per-page date to report for these: they aren't backed by a single
  // Airtable record, so there's nothing truthful to put in lastModified.
  // Omitting it (rather than stamping every one with the sitemap's own build
  // time) avoids the "everything changed today" anti-pattern Google's docs
  // warn erodes trust in a sitemap's lastmod signal over time.
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/trips`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/articles`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/journeys`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/courses`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/compare`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/how-we-rate`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/golf-trip-cost-index`, changeFrequency: "monthly", priority: 0.6 },
    // /articles only previews three articles per category; /articles/all is the
    // paginated index that actually reaches every one of them.
    { url: `${SITE_URL}/articles/all`, changeFrequency: "weekly", priority: 0.7 },
    ...ARTICLE_CATEGORIES.map((c) => ({
      url: `${SITE_URL}/articles/category/${c}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    // Unlinked from the main nav on purpose while the venue is unconfirmed, but
    // indexable: resorts we've emailed search for us before they reply.
    {
      url: `${SITE_URL}/events/father-son-invitational`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const filterPages: MetadataRoute.Sitemap = [
    ...REGIONS.map((r) => ({
      url: `${SITE_URL}/trips/region/${r.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];

  // createdTime is Airtable's own record-creation timestamp — real and
  // per-record, unlike a shared build-time "now". It won't move when a trip is
  // only edited (Airtable's API doesn't expose last-edited time without a
  // dedicated formula field, which the base doesn't have), but a stable date
  // wrong in that one direction beats every trip claiming to change daily.
  const tripPages: MetadataRoute.Sitemap = trips.map((t) => ({
    url: `${SITE_URL}/trips/${t.slug}`,
    ...(t.createdTime ? { lastModified: new Date(t.createdTime) } : {}),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const articlePages: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE_URL}/articles/${a.slug}`,
    ...(a.publishedOn ? { lastModified: new Date(a.publishedOn) } : {}),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const journeyPages: MetadataRoute.Sitemap = journeys.map((j) => ({
    url: `${SITE_URL}/journeys/${j.slug}`,
    ...(j.createdTime ? { lastModified: new Date(j.createdTime) } : {}),
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
