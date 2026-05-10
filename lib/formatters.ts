import { StayType } from "./types";

export function formatStayType(stayType: StayType) {
  switch (stayType) {
    case "on_property":
      return "On Property";
    case "off_property":
      return "Off Property";
    case "mixed":
      return "Mixed";
    default:
      return stayType;
  }
}

export function formatPublishedDate(value?: string | null) {
  if (!value) return null;
  // Airtable date often returns ISO string; handle either.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatCostTier(tier: 1 | 2 | 3 | 4 | 5) {
  return "$".repeat(tier);
}

export function formatRanking(value?: number) {
  return typeof value === "number" ? value : "NR";
}

export function formatDuration(minDays: number, maxDays: number) {
  if (minDays === maxDays) return `${minDays} days`;
  return `${minDays}–${maxDays} days`;
}

export function formatDriving(miles?: string) {
  if (!miles) return "—";
  return miles;
}
