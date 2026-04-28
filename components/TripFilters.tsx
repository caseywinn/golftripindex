"use client";

import { useState } from "react";
import Link from "next/link";
import {
  REGIONS,
  COST_TIERS,
  DURATION_RANGES,
  TRIP_TYPES,
  SEASONS,
  TOP_100_COUNTS,
  labelFromStateSlug,
} from "@/lib/filters";

type Props = {
  activeType?: string;
  activeValue?: string;
};

function getActiveLabel(activeType?: string, activeValue?: string): string | null {
  if (!activeType || !activeValue) return null;
  switch (activeType) {
    case "region":
      return REGIONS.find((r) => r.slug === activeValue)?.label ?? null;
    case "state":
      return labelFromStateSlug(activeValue);
    case "cost": {
      const def = COST_TIERS.find((c) => c.slug === activeValue);
      return def ? `${def.label} (${"$".repeat(def.tier)})` : null;
    }
    case "duration":
      return DURATION_RANGES.find((d) => d.slug === activeValue)?.label ?? null;
    case "type":
      return TRIP_TYPES.find((t) => t.slug === activeValue)?.label ?? null;
    case "season":
      return SEASONS.find((s) => s.slug === activeValue)?.label ?? null;
    case "top100":
      return `${activeValue}+ Top 100`;
    default:
      return null;
  }
}

const chip = (active: boolean): React.CSSProperties => ({
  display: "inline-block",
  padding: "5px 13px",
  borderRadius: 999,
  border: `1px solid ${active ? "#111" : "#d1d5db"}`,
  background: active ? "#111" : "white",
  color: active ? "white" : "#374151",
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  textDecoration: "none",
  whiteSpace: "nowrap",
  cursor: "pointer",
});

const row: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 8,
};

const categoryLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#9ca3af",
  minWidth: 68,
};

export default function TripFilters({ activeType, activeValue }: Props) {
  const [open, setOpen] = useState(false);
  const activeLabel = getActiveLabel(activeType, activeValue);

  function isActive(type: string, value: string) {
    return activeType === type && activeValue === value;
  }

  function href(type: string, value: string) {
    return isActive(type, value) ? "/trips" : `/trips/${type}/${value}`;
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 14px",
          borderRadius: 999,
          border: `1px solid ${activeLabel ? "#111" : "#d1d5db"}`,
          background: activeLabel ? "#111" : "white",
          color: activeLabel ? "white" : "#374151",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: open ? 16 : 0,
        }}
      >
        <span>{open ? "Hide Filters" : "Filter Trips"}</span>
        {activeLabel && !open && (
          <span style={{
            background: "rgba(255,255,255,0.2)",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 12,
          }}>
            {activeLabel}
          </span>
        )}
        <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ paddingBottom: 20, borderBottom: "1px solid #e5e7eb" }}>
          <div style={row}>
            <span style={categoryLabel}>Region</span>
            {REGIONS.map((r) => (
              <Link key={r.slug} href={href("region", r.slug)} style={chip(isActive("region", r.slug))}>
                {r.label}
              </Link>
            ))}
          </div>

          <div style={row}>
            <span style={categoryLabel}>Cost</span>
            {COST_TIERS.map((c) => (
              <Link key={c.slug} href={href("cost", c.slug)} style={chip(isActive("cost", c.slug))}>
                {c.label} {"$".repeat(c.tier)}
              </Link>
            ))}
          </div>

          <div style={row}>
            <span style={categoryLabel}>Duration</span>
            {DURATION_RANGES.map((d) => (
              <Link key={d.slug} href={href("duration", d.slug)} style={chip(isActive("duration", d.slug))}>
                {d.label}
              </Link>
            ))}
          </div>

          <div style={row}>
            <span style={categoryLabel}>Type</span>
            {TRIP_TYPES.map((t) => (
              <Link key={t.slug} href={href("type", t.slug)} style={chip(isActive("type", t.slug))}>
                {t.label}
              </Link>
            ))}
          </div>

          <div style={row}>
            <span style={categoryLabel}>Season</span>
            {SEASONS.map((s) => (
              <Link key={s.slug} href={href("season", s.slug)} style={chip(isActive("season", s.slug))}>
                {s.label}
              </Link>
            ))}
          </div>

          <div style={row}>
            <span style={categoryLabel}>Top 100</span>
            {TOP_100_COUNTS.map((c) => (
              <Link key={c.slug} href={href("top100", c.slug)} style={chip(isActive("top100", c.slug))}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
