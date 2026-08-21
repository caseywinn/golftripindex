"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  REGIONS,
  COST_TIERS,
  DURATION_RANGES,
  TRIP_TYPES,
  SEASONS,
  TOP_100_COUNTS,
  filterTrips,
} from "@/lib/filters";

type TripListItem = {
  id: string;
  slug: string;
  name: string;
  secondaryName?: string | null;
  currentRanking?: number | null;
  previousRanking?: number | null;
  durationMinDays?: number | null;
  durationMaxDays?: number | null;
  driving?: string | null;
  stayType?: string | null;
  leadTime?: string | null;
  costTier?: 1 | 2 | 3 | 4 | 5;
  overview?: string | null;
  firstCourse?: { slug?: string | null } | null;
  golfRating?: number | null;
  lodgingRating?: number | null;
  foodRating?: number | null;
  vibeRating?: number | null;
  overallRating?: number | null;
  region?: string | undefined;
  state?: string | undefined;
  seasons?: string[] | undefined;
  top100Count?: number | null;
};
import TripsListClient from "@/components/TripsListClient";
import styles from "@/styles/tripFilters.module.css";

type FilterKey = "region" | "cost" | "duration" | "type" | "season" | "top100";

const ALL_FILTER_KEYS: FilterKey[] = ["region", "cost", "duration", "type", "season", "top100"];

const FILTER_DEFS: { key: FilterKey; label: string; items: { slug: string; label: string }[] }[] = [
  { key: "region",   label: "Region",       items: REGIONS.map(r => ({ slug: r.slug, label: r.label })) },
  { key: "cost",     label: "Budget",        items: COST_TIERS.map(c => ({ slug: c.slug, label: c.label })) },
  { key: "duration", label: "Duration",      items: DURATION_RANGES.map(d => ({ slug: d.slug, label: `${d.label} (${d.description})` })) },
  { key: "type",     label: "Stay Type",     items: TRIP_TYPES.map(t => ({ slug: t.slug, label: t.label })) },
  { key: "season",   label: "Best Season",   items: SEASONS.map(s => ({ slug: s.slug, label: s.label })) },
  { key: "top100",   label: "Top 100",       items: TOP_100_COUNTS.map(n => ({ slug: n.slug, label: `${n.label} courses` })) },
];

export default function TripsWithFilters({
  trips,
  pageSize = 20,
}: {
  trips: TripListItem[];
  pageSize?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openKey, setOpenKey] = useState<FilterKey | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Deliberately not useSearchParams(): reading it during render opts this
  // subtree out of static rendering, which stripped every trip card — and so
  // every /trips/<slug> link — from the server HTML. Read the URL after mount
  // and own the filter state locally instead.
  const [activeFilters, setActiveFilters] = useState<Partial<Record<FilterKey, string[]>>>({});

  useEffect(() => {
    function syncFromUrl() {
      const sp = new URLSearchParams(window.location.search);
      const result: Partial<Record<FilterKey, string[]>> = {};
      for (const key of ALL_FILTER_KEYS) {
        const val = sp.get(key);
        if (val) result[key] = val.split(",").filter(Boolean);
      }
      setActiveFilters(result);
    }
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          values.some(v => filterTrips([trip as any], key, v).length > 0)
        );
      }
    }
    return result.sort((a, b) => (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999));
  }, [trips, activeFilters]);

  function toggle(key: FilterKey, value: string) {
    const current = activeFilters[key] ?? [];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];

    const updated = { ...activeFilters };
    if (next.length === 0) delete updated[key]; else updated[key] = next;
    setActiveFilters(updated);

    const params = new URLSearchParams(window.location.search);
    if (next.length === 0) params.delete(key); else params.set(key, next.join(","));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function clearAll() {
    setActiveFilters({});
    const params = new URLSearchParams(window.location.search);
    for (const key of ALL_FILTER_KEYS) params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const totalActive = ALL_FILTER_KEYS.reduce((n, k) => n + (activeFilters[k]?.length ?? 0), 0);

  // Close desktop dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenKey(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Build label for mobile summary
  function labelFor(key: FilterKey, val: string): string {
    switch (key) {
      case "region":   return REGIONS.find(r => r.slug === val)?.label ?? val;
      case "cost":     return COST_TIERS.find(c => c.slug === val)?.label ?? val;
      case "duration": return DURATION_RANGES.find(d => d.slug === val)?.label ?? val;
      case "type":     return TRIP_TYPES.find(t => t.slug === val)?.label ?? val;
      case "season":   return SEASONS.find(s => s.slug === val)?.label ?? val;
      case "top100":   return `${val}+ Top 100`;
    }
  }

  const summaryText = ALL_FILTER_KEYS
    .flatMap(k => (activeFilters[k] ?? []).map(v => labelFor(k, v)))
    .join(" · ");

  // How many filter groups are near the right edge (to flip their dropdown)
  const FLIP_LAST_N = 2;

  return (
    <div style={{ marginBottom: 32 }}>

      {/* ── DESKTOP: horizontal dropdown row ── */}
      <div className={styles.desktopFilters} ref={barRef}>
        {FILTER_DEFS.map(({ key, label, items }, idx) => {
          const active = activeFilters[key] ?? [];
          const isOpen = openKey === key;
          const flipRight = idx >= FILTER_DEFS.length - FLIP_LAST_N;

          let btnLabel = label;
          if (active.length === 1) {
            btnLabel = labelFor(key, active[0]);
          } else if (active.length > 1) {
            btnLabel = `${label} · ${active.length}`;
          }

          return (
            <div key={key} className={styles.dropWrap}>
              <button
                className={[
                  styles.dropBtn,
                  active.length > 0 ? styles.dropBtnActive : "",
                  isOpen && active.length === 0 ? styles.dropBtnOpen : "",
                ].join(" ")}
                onClick={() => setOpenKey(isOpen ? null : key)}
                aria-expanded={isOpen}
              >
                {active.length > 0 && <span className={styles.activeDot} />}
                {btnLabel}
                <svg className={[styles.chevron, isOpen ? styles.chevronOpen : ""].join(" ")} viewBox="0 0 12 12">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isOpen && (
                <div className={[styles.dropPanel, flipRight ? styles.dropPanelRight : ""].join(" ")}>
                  {items.map(item => {
                    const checked = active.includes(item.slug);
                    return (
                      <button
                        key={item.slug}
                        className={[styles.optionBtn, checked ? styles.optionBtnActive : ""].join(" ")}
                        onClick={() => toggle(key, item.slug)}
                      >
                        <span className={[styles.checkbox, checked ? styles.checkboxChecked : ""].join(" ")}>
                          {checked && (
                            <svg className={styles.checkmark} viewBox="0 0 10 10">
                              <polyline points="1.5,5 4,7.5 8.5,2.5" />
                            </svg>
                          )}
                        </span>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* ── MOBILE: single toggle button + expanded panel ── */}
      <div className={styles.mobileFilters}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: mobileOpen ? 20 : 16 }}>
          <button
            onClick={() => setMobileOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 16px",
              background: mobileOpen ? "#0b0f1a" : "#fff",
              color: mobileOpen ? "#fff" : "#0b0f1a",
              border: "1.5px solid #0b0f1a",
              borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: "pointer", letterSpacing: "0.02em", flexShrink: 0,
            }}
          >
            <span>{mobileOpen ? "Close Filters" : "Filter"}</span>
            {!mobileOpen && totalActive > 0 && (
              <span style={{
                background: "#0b0f1a", color: "#fff", borderRadius: 10,
                padding: "1px 7px", fontSize: 11, fontWeight: 700,
              }}>
                {totalActive}
              </span>
            )}
          </button>

          {!mobileOpen && totalActive > 0 && (
            <span style={{ fontSize: 13, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {summaryText}
            </span>
          )}

          {totalActive > 0 && (
            <button
              onClick={clearAll}
              style={{
                background: "none", border: "none", color: "#6b7280",
                fontSize: 13, cursor: "pointer", padding: "4px 0",
                textDecoration: "underline", flexShrink: 0, marginLeft: "auto",
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {mobileOpen && (
          <div style={{
            background: "#fff", border: "1px solid #e5e7eb",
            borderRadius: 8, padding: "20px 24px", marginBottom: 24,
            display: "flex", flexDirection: "column", gap: 20,
          }}>
            {FILTER_DEFS.map(({ key, label, items }) => (
              <FilterGroup
                key={key}
                label={label}
                items={items}
                activeValues={activeFilters[key] ?? []}
                onToggle={v => toggle(key, v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Result count + clear ── */}
      {totalActive > 0 && (
        <div className={styles.metaRow}>
          <span className={styles.resultCount}>
            {filtered.length} trip{filtered.length !== 1 ? "s" : ""} match
          </span>
          <button className={styles.clearBtn} onClick={clearAll}>
            Clear all
          </button>
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
        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
        color: "#6b7280", textTransform: "uppercase", marginBottom: 8,
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
                padding: "5px 12px", borderRadius: 20,
                border: `1.5px solid ${isActive ? "#0b0f1a" : "#d1d5db"}`,
                background: isActive ? "#0b0f1a" : "#fff",
                color: isActive ? "#fff" : "#374151",
                fontSize: 13, cursor: "pointer",
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
