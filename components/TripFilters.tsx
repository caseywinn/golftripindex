import Link from "next/link";
import { REGIONS, COST_TIERS, DURATION_RANGES, TRIP_TYPES, SEASONS } from "@/lib/filters";

type Props = {
  activeType?: string;
  activeValue?: string;
};

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

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#9ca3af",
  minWidth: 68,
};

export default function TripFilters({ activeType, activeValue }: Props) {
  function isActive(type: string, value: string) {
    return activeType === type && activeValue === value;
  }

  function href(type: string, value: string) {
    return isActive(type, value) ? "/trips" : `/trips/${type}/${value}`;
  }

  const isTop100Active = activeType === "top-100";

  return (
    <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #e5e7eb" }}>
      <div style={row}>
        <span style={label}>Region</span>
        {REGIONS.map((r) => (
          <Link key={r.slug} href={href("region", r.slug)} style={chip(isActive("region", r.slug))}>
            {r.label}
          </Link>
        ))}
      </div>

      <div style={row}>
        <span style={label}>Cost</span>
        {COST_TIERS.map((c) => (
          <Link key={c.slug} href={href("cost", c.slug)} style={chip(isActive("cost", c.slug))}>
            {c.label} {"$".repeat(c.tier)}
          </Link>
        ))}
      </div>

      <div style={row}>
        <span style={label}>Duration</span>
        {DURATION_RANGES.map((d) => (
          <Link key={d.slug} href={href("duration", d.slug)} style={chip(isActive("duration", d.slug))}>
            {d.label}
          </Link>
        ))}
      </div>

      <div style={row}>
        <span style={label}>Type</span>
        {TRIP_TYPES.map((t) => (
          <Link key={t.slug} href={href("type", t.slug)} style={chip(isActive("type", t.slug))}>
            {t.label}
          </Link>
        ))}
      </div>

      <div style={row}>
        <span style={label}>Season</span>
        {SEASONS.map((s) => (
          <Link key={s.slug} href={href("season", s.slug)} style={chip(isActive("season", s.slug))}>
            {s.label}
          </Link>
        ))}
      </div>

      <div style={row}>
        <span style={label}>Feature</span>
        <Link href={isTop100Active ? "/trips" : "/trips/top-100"} style={chip(isTop100Active)}>
          Top 100 Courses
        </Link>
      </div>
    </div>
  );
}
