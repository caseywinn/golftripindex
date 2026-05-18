"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import styles from "../../styles/cost-index.module.css";

export type TripCostRow = {
  slug: string;
  name: string;
  state: string;
  greenFees: string;
  lodging: string;
  allIn: string;
  allInLow: number;
  allInHigh: number;
  tier: "Value" | "Mid" | "Mid-High" | "Premium" | "Ultra-Premium";
  callout: string;
  ranking?: number;
};

const TIERS = ["All", "Value", "Mid", "Mid-High", "Premium", "Ultra-Premium"] as const;
type TierFilter = (typeof TIERS)[number];

const SORT_OPTIONS = [
  { value: "ranking", label: "GTI Ranking" },
  { value: "name", label: "Trip Name (A-Z)" },
  { value: "allin-asc", label: "All-In Cost: Low to High" },
  { value: "allin-desc", label: "All-In Cost: High to Low" },
  { value: "state", label: "State / Province" },
] as const;
type SortOption = (typeof SORT_OPTIONS)[number]["value"];

function tierClass(tier: TripCostRow["tier"]) {
  switch (tier) {
    case "Value": return styles.tierValue;
    case "Mid": return styles.tierMid;
    case "Mid-High": return styles.tierMidHigh;
    case "Premium": return styles.tierPremium;
    case "Ultra-Premium": return styles.tierUltra;
  }
}

export default function CostIndexClient({ trips }: { trips: TripCostRow[] }) {
  const [tierFilter, setTierFilter] = useState<TierFilter>("All");
  const [sort, setSort] = useState<SortOption>("ranking");

  const filtered = useMemo(() => {
    let rows = tierFilter === "All" ? trips : trips.filter((t) => t.tier === tierFilter);
    rows = [...rows].sort((a, b) => {
      if (sort === "ranking") return (a.ranking ?? 999) - (b.ranking ?? 999);
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "allin-asc") return a.allInLow - b.allInLow;
      if (sort === "allin-desc") return b.allInLow - a.allInLow;
      if (sort === "state") return a.state.localeCompare(b.state);
      return 0;
    });
    return rows;
  }, [trips, tierFilter, sort]);

  return (
    <>
      <div className={styles.controls}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Tier</span>
          {TIERS.map((t) => (
            <button
              key={t}
              className={`${styles.filterBtn} ${tierFilter === t ? styles.filterBtnActive : ""}`}
              onClick={() => setTierFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className={styles.sortGroup}>
          <span className={styles.filterLabel}>Sort</span>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className={styles.resultCount}>{filtered.length} trips</span>
        </div>
      </div>

      <div className={styles.tableSection}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Trip</th>
                <th>State</th>
                <th className={styles.right}>Green Fees / Rd</th>
                <th className={styles.right}>Lodging / Nt</th>
                <th className={styles.right}>All-In / 3 Days</th>
                <th>Tier</th>
                <th>Key Callout</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((trip, idx) => (
                <tr key={trip.slug}>
                  <td className={styles.rankCell}>
                    {sort === "ranking" && trip.ranking ? `#${trip.ranking}` : idx + 1}
                  </td>
                  <td className={styles.tripCell}>
                    <Link href={`/trips/${trip.slug}`} className={styles.tripLink}>
                      {trip.name}
                    </Link>
                  </td>
                  <td className={styles.stateCell}>{trip.state}</td>
                  <td className={styles.numCell}>{trip.greenFees}</td>
                  <td className={styles.numCell}>{trip.lodging}</td>
                  <td className={styles.allInCell}>{trip.allIn}</td>
                  <td>
                    <span className={`${styles.tierBadge} ${tierClass(trip.tier)}`}>
                      {trip.tier}
                    </span>
                  </td>
                  <td className={styles.calloutCell}>{trip.callout}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
