// Per-person cost of a standardized trip (3 nights, 4 rounds) so trips compare evenly.
// Stored as text ranges ("$800–1,200") on GolfTrips fields; no linked table.

import type { TripCostRow } from "./types";

type Fields = Record<string, unknown>;

// Optional rows add $0 to the low end of the Total and their high end to the top.
const LINES: { key: string; label: string; optional?: boolean }[] = [
  { key: "Tee Times", label: "Tee times (4 rounds)" },
  { key: "Lodging", label: "Lodging (3 nights)" },
  { key: "Food", label: "Food & drink" },
  { key: "Rental Car", label: "Rental car" },
  { key: "Caddie", label: "Caddie" },
  { key: "Replay", label: "Replay round", optional: true },
  { key: "Short Course", label: "Short course", optional: true },
];

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Rows with any value set; every row but tee times, lodging and food can be blank and drop out. */
export function buildCostRows(f: Fields): TripCostRow[] {
  const caddieStatus = text(f["Caddie Status"]);
  return LINES.flatMap(({ key, label, optional = false }) => {
    const peak = text(f[`Cost ${key} Peak`]);
    const offPeak = text(f[`Cost ${key} Off-Peak`]);
    if (!peak && !offPeak) return [];
    const note = optional ? "optional" : key === "Caddie" && caddieStatus ? caddieStatus.toLowerCase() : undefined;
    return [{ id: key, line: label, note, optional, peak, offPeak }];
  });
}

/** "$800–1,200" → {low: 800, high: 1200}; "$500" → {500, 500}; anything else → null. */
export function parseRange(s: string): { low: number; high: number } | null {
  const parts = s.replace(/[$,\s]/g, "").split(/[-–—]/).filter(Boolean);
  const nums = parts.map(Number);
  if (nums.length === 0 || nums.length > 2 || nums.some((n) => !Number.isFinite(n))) return null;
  return { low: nums[0], high: nums[nums.length - 1] };
}

/** Total for one season column: optional rows count as $0 on the low end. */
export function costTotal(rows: TripCostRow[], col: "peak" | "offPeak"): { low: number; high: number } | null {
  let low = 0, high = 0, any = false;
  for (const row of rows) {
    const r = parseRange(row[col]);
    if (!r) continue;
    any = true;
    low += row.optional ? 0 : r.low;
    high += r.high;
  }
  return any ? { low, high } : null;
}

/** Totals are estimates: widen to the nearest $100. */
export function formatTotal(r: { low: number; high: number } | null): string {
  if (!r) return "";
  const low = Math.floor(r.low / 100) * 100;
  const high = Math.ceil(r.high / 100) * 100;
  return low === high ? `$${low.toLocaleString()}` : `$${low.toLocaleString()}–${high.toLocaleString()}`;
}
