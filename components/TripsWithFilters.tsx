"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useMemo } from "react";
import type { TripWithFirstCourse } from "@/lib/airtable";
import {
  REGIONS,
  COST_TIERS,
  DURATION_RANGES,
  TRIP_TYPES,
  SEASONS,
  TOP_100_COUNTS,
  filterTrips,
} from "@/lib/filters";
import TripsListClient from "@/components/TripsListClient";

type FilterKey = "region" | "cost" | "duration" | "type" | "season" | "top100";

const ALL_FILTER_KEYS: FilterKey[] = ["region", "cost", "duration", "type", "season", "top100"];

export default function TripsWithFilters({
  trips,
  pageSize = 20,
}: {
  trips: TripWithFirstCourse[];
  pageSize?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const activeFilters = useMemo<Partial<Record<FilterKey, string[]>>>(() => {
    const result: Partial<Record<FilterKey, string[]>> = {};
    for (const key of ALL_FILTER_KEYS) {
      const val = searchParams.get(key);
      if (val) result[key] = val.split(",").filter(Boolean);
    }
    return result;
  }, [searchParams]);

  const filtered = useMemo(() => {
    let result = [...trips];

    for (const key of ALL_FILTER_KEYS) {
      const values = activeFilters[key];
      if (!values || values.length === 0) continue;

      if (key === "top100") {
        const nums = values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
        if (nums.length === 0) continue;
        const min = Math.min(...nums);
        result = result.filter(t => (t.top100Count ?? 0) >= min);
      } else {
        result = result.filter(trip =>
          values.some(v => filterTrips([trip], key, v).length > 0)
        );
      }
    }

    return result.sort((a, b) => (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999));
  }, [trips, activeFilters]);

  function toggle(key: FilterKey, value: string) {
    const current = activeFilters[key] ?? [];
    const isActive = current.includes(value);
    const next = isActive ? current.filter(v => v !== value) : [...current, value];

    const params = new URLSearchParams(searchParams.toString());
    if (next.length === 0) {
      params.delete(key);
    } else {
      params.set(key, next.join(","));
    }

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ALL_FILTER_KEYS) params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const totalActive = ALL_FILTER_KEYS.reduce((n, k) => n + (activeFilters[k]?.length ?? 0), 0);

  function labelFor(key: FilterKey, val: string): string {
    switch (key) {
      case "region": return REGIONS.find(r => r.slug === val)?.label ?? val;
      case "cost": return COST_TIERS.find(c => c.slug === val)?.label ?? val;
      case "duration": return DURATION_RANGES.find(d => d.slug === val)?.label ?? val;
      case "type": return TRIP_TYPES.find(t => t.slug === val)?.label ?? val;
      case "season": return SEASONS.find(s => s.slug === val)?.label ?? val;
      case "top100": return `${val}+ Top 100`;
    }
  }

  const summaryText = ALL_FILTER_KEYS
    .flatMap(k => (activeFilters[k] ?? []).map(v => labelFor(k, v)))
    .join(" · ");

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Toggle row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: open ? 20 : 16 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: open ? "#0b0f1a" : "#fff",
            color: open ? "#fff" : "#0b0f1a",
            border: "1.5px solid #0b0f1a",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.02em",
            flexShrink: 0,
          }}
        >
          <span>{open ? "Close Filters" : "Filter"}</span>
          {!open && totalActive > 0 && (
            <span style={{
              background: "#0b0f1a",
              color: "#fff",
              borderRadius: 10,
              padding: "1px 7px",
              fontSize: 11,
              fontWeight: 700,
            }}>
              {totalActive}
            </span>
          )}
        </button>

        {!open && totalActive > 0 && (
          <span style={{ fontSize: 13, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {summaryText}
          </span>
        )}

        {totalActive > 0 && (
          <button
            onClick={clearAll}
            style={{
              background: "none",
              border: "none",
              color: "#6b7280",
              fontSize: 13,
              cursor: "pointer",
              padding: "4px 0",
              textDecoration: "underline",
              flexShrink: 0,
              marginLeft: "auto",
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter panel */}
      {open && (
        <div style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}>
          <FilterGroup
            label="Region"
            items={REGIONS.map(r => ({ slug: r.slug, label: r.label }))}
            activeValues={activeFilters.region ?? []}
            onToggle={v => toggle("region", v)}
          />
          <FilterGroup
            label="Budget"
            items={COST_TIERS.map(c => ({ slug: c.slug, label: c.label }))}
            activeValues={activeFilters.cost ?? []}
            onToggle={v => toggle("cost", v)}
          />
          <FilterGroup
            label="Duration"
            items={DURATION_RANGES.map(d => ({ slug: d.slug, label: `${d.label} (${d.description})` }))}
            activeValues={activeFilters.duration ?? []}
            onToggle={v => toggle("duration", v)}
          />
          <FilterGroup
            label="Stay Type"
            items={TRIP_TYPES.map(t => ({ slug: t.slug, label: t.label }))}
            activeValues={activeFilters.type ?? []}
            onToggle={v => toggle("type", v)}
          />
          <FilterGroup
            label="Best Season"
            items={SEASONS.map(s => ({ slug: s.slug, label: s.label }))}
            activeValues={activeFilters.season ?? []}
            onToggle={v => toggle("season", v)}
          />
          <FilterGroup
            label="Top 100 Courses"
            items={TOP_100_COUNTS.map(n => ({ slug: n.slug, label: `${n.label} courses` }))}
            activeValues={activeFilters.top100 ?? []}
            onToggle={v => toggle("top100", v)}
          />
        </div>
      )}

      {/* Result count when filters are active */}
      {totalActive > 0 && (
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          {filtered.length} trip{filtered.length !== 1 ? "s" : ""} match
        </div>
      )}

      {filtered.length > 0 ? (
        <TripsListClient trips={filtered} pageSize={pageSize} />
      ) : (
        <div style={{ padding: "40px 0", color: "#6b7280", fontSize: 15 }}>
          No trips match your filters.{" "}
          <button
            onClick={clearAll}
            style={{ background: "none", border: "none", color: "#111", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontSize: 15, padding: 0 }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  items,
  activeValues,
  onToggle,
}: {
  label: string;
  items: { slug: string; label: string }[];
  activeValues: string[];
  onToggle: (slug: string) => void;
}) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: "#6b7280",
        textTransform: "uppercase",
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map(({ slug, label }) => {
          const isActive = activeValues.includes(slug);
          return (
            <button
              key={slug}
              onClick={() => onToggle(slug)}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                border: `1.5px solid ${isActive ? "#0b0f1a" : "#d1d5db"}`,
                background: isActive ? "#0b0f1a" : "#fff",
                color: isActive ? "#fff" : "#374151",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
