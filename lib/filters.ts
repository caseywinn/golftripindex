import type { GolfTrip } from "./types";

export const REGIONS = [
  { slug: "pacific-northwest", label: "Pacific Northwest" },
  { slug: "california", label: "California" },
  { slug: "southwest", label: "Southwest" },
  { slug: "southeast", label: "Southeast" },
  { slug: "mid-atlantic", label: "Mid-Atlantic" },
  { slug: "new-england", label: "New England" },
  { slug: "midwest", label: "Midwest" },
  { slug: "mountain-west", label: "Mountain West" },
  { slug: "texas", label: "Texas" },
  { slug: "canada", label: "Canada" },
] as const;

export const COST_TIERS = [
  { slug: "budget", label: "Budget", tiers: [1, 2] as number[], display: "$–$$" },
  { slug: "moderate", label: "Moderate", tiers: [3] as number[], display: "$$$" },
  { slug: "premium", label: "Premium", tiers: [4] as number[], display: "$$$$" },
  { slug: "luxury", label: "Luxury", tiers: [5] as number[], display: "$$$$$" },
] as const;

export const DURATION_RANGES = [
  { slug: "weekend", label: "Weekend", description: "2–3 days", minDays: 2, maxDays: 3 },
  { slug: "4-5-days", label: "4–5 Days", description: "4–5 days", minDays: 4, maxDays: 5 },
  { slug: "week-plus", label: "Week+", description: "6+ days", minDays: 6, maxDays: 99 },
] as const;

export const TRIP_TYPES = [
  { slug: "on-property", label: "On Property", stayType: "on_property" },
  { slug: "off-property", label: "Off Property", stayType: "off_property" },
  { slug: "mixed", label: "Mixed", stayType: "mixed" },
] as const;

export const SEASONS = [
  { slug: "spring", label: "Spring" },
  { slug: "summer", label: "Summer" },
  { slug: "fall", label: "Fall" },
  { slug: "winter", label: "Winter" },
] as const;

export const TOP_100_COUNTS = [
  { slug: "1", label: "1+", min: 1 },
  { slug: "2", label: "2+", min: 2 },
  { slug: "3", label: "3+", min: 3 },
  { slug: "4", label: "4+", min: 4 },
  { slug: "5", label: "5+", min: 5 },
] as const;

export function slugifyState(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function labelFromStateSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function getFilterMeta(
  filterType: string,
  filterValue: string
): { title: string; description: string; heading: string } | null {
  switch (filterType) {
    case "region": {
      const def = REGIONS.find((r) => r.slug === filterValue);
      if (!def) return null;
      return {
        title: `Best Golf Trips in the ${def.label}`,
        description: `The best golf trips in the ${def.label}, ranked and reviewed by overall experience, courses, lodging, and vibe.`,
        heading: `Golf Trips — ${def.label}`,
      };
    }
    case "state": {
      const label = labelFromStateSlug(filterValue);
      return {
        title: `Best Golf Trips in ${label}`,
        description: `The best golf trips in ${label}, ranked and reviewed — courses, lodging, food, and overall experience.`,
        heading: `Golf Trips — ${label}`,
      };
    }
    case "cost": {
      const def = COST_TIERS.find((c) => c.slug === filterValue);
      if (!def) return null;
      return {
        title: `${def.label} Golf Trips (${def.display})`,
        description: `The best ${def.label.toLowerCase()} golf trips in America, ranked by quality, courses, and overall experience.`,
        heading: `Golf Trips — ${def.label} (${def.display})`,
      };
    }
    case "duration": {
      const def = DURATION_RANGES.find((d) => d.slug === filterValue);
      if (!def) return null;
      return {
        title: `${def.label} Golf Trips (${def.description})`,
        description: `The best ${def.label.toLowerCase()} golf trips in America, ranked by overall experience, courses, and logistics.`,
        heading: `Golf Trips — ${def.label}`,
      };
    }
    case "type": {
      const def = TRIP_TYPES.find((t) => t.slug === filterValue);
      if (!def) return null;
      return {
        title: `${def.label} Golf Trips`,
        description: `The best ${def.label.toLowerCase()} golf trips in America, ranked by courses, lodging, and overall experience.`,
        heading: `Golf Trips — ${def.label}`,
      };
    }
    case "season": {
      const def = SEASONS.find((s) => s.slug === filterValue);
      if (!def) return null;
      return {
        title: `Best ${def.label} Golf Trips`,
        description: `The best golf trips to take in ${def.label.toLowerCase()}, ranked by course quality, overall experience, and seasonal conditions.`,
        heading: `Golf Trips — Best in ${def.label}`,
      };
    }
    case "top100": {
      const min = parseInt(filterValue, 10);
      if (isNaN(min)) return null;
      return {
        title: `Golf Trips with ${min}+ Top 100 Courses`,
        description: `Golf trips that include at least ${min} Top 100 ranked course${min === 1 ? "" : "s"} in America, ranked by overall experience and course quality.`,
        heading: `Golf Trips — ${min}+ Top 100 Courses`,
      };
    }
    default:
      return null;
  }
}

type FilterableTrip = Pick<
  GolfTrip,
  "region" | "state" | "costTier" | "durationMaxDays" | "stayType" | "seasons" | "top100Count"
>;

export function filterTrips<T extends FilterableTrip>(
  trips: T[],
  filterType: string,
  filterValue: string
): T[] {
  switch (filterType) {
    case "region":
      return trips.filter(
        (t) => t.region && slugifyState(t.region) === filterValue
      );
    case "state":
      return trips.filter(
        (t) => t.state && slugifyState(t.state) === filterValue
      );
    case "cost": {
      const def = COST_TIERS.find((c) => c.slug === filterValue);
      return def ? trips.filter((t) => def.tiers.includes(t.costTier)) : [];
    }
    case "duration": {
      const def = DURATION_RANGES.find((d) => d.slug === filterValue);
      if (!def) return [];
      // Bucket a trip by its longest length (durationMaxDays), so "6+ days"
      // keeps any trip that can run 6+ days even if its shorter option is less.
      return trips.filter(
        (t) =>
          (t.durationMaxDays ?? 0) >= def.minDays &&
          (t.durationMaxDays ?? 0) <= def.maxDays
      );
    }
    case "type": {
      const def = TRIP_TYPES.find((tt) => tt.slug === filterValue);
      return def ? trips.filter((t) => t.stayType === def.stayType) : [];
    }
    case "season":
      return trips.filter((t) =>
        t.seasons?.some((s) => s.toLowerCase() === filterValue)
      );
    case "top100": {
      const min = parseInt(filterValue, 10);
      if (isNaN(min)) return [];
      return trips.filter((t) => (t.top100Count ?? 0) >= min);
    }
    default:
      return [];
  }
}
