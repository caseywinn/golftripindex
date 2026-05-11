"use client";
import { useState } from "react";
import dt from "../../styles/designTrip.module.css";
import type { TripCostRow } from "@/lib/types";

type Col = "peak" | "shoulder" | "offSeason";

const COL_LABELS: Record<Col, string> = {
  peak: "Peak",
  shoulder: "Shoulder",
  offSeason: "Off-Season",
};

function parsePriceRange(s: string): { min: number; max: number } | null {
  const cleaned = s.replace(/[$,\s]/g, "");
  const range = cleaned.match(/^(\d+)-(\d+)$/);
  if (range) return { min: +range[1], max: +range[2] };
  const single = cleaned.match(/^(\d+)$/);
  if (single) { const n = +single[1]; return { min: n, max: n }; }
  return null;
}

function sumPriceRanges(values: string[]): string {
  let totalMin = 0, totalMax = 0, hasAny = false;
  for (const v of values) {
    const parsed = parsePriceRange(v);
    if (parsed) { totalMin += parsed.min; totalMax += parsed.max; hasAny = true; }
  }
  if (!hasAny) return "";
  const fmt = (n: number) => "$" + n.toLocaleString();
  return totalMin === totalMax ? fmt(totalMin) : `${fmt(totalMin)}–${fmt(totalMax)}`;
}

export default function CostTable({
  rows,
  costNote,
}: {
  rows: TripCostRow[];
  costNote?: string;
}) {
  const [col, setCol] = useState<Col>("peak");

  const nonOptional = rows.filter((r) => !r.optional);
  const totalPeak = sumPriceRanges(nonOptional.map((r) => r.peak));
  const totalShoulder = sumPriceRanges(nonOptional.map((r) => r.shoulder));
  const totalOffSeason = sumPriceRanges(nonOptional.map((r) => r.offSeason));
  const hasTotal = totalPeak || totalShoulder || totalOffSeason;

  const colTotal = col === "peak" ? totalPeak : col === "shoulder" ? totalShoulder : totalOffSeason;

  return (
    <>
      {/* Mobile column toggle */}
      <div className={dt.costColToggle}>
        {(["peak", "shoulder", "offSeason"] as Col[]).map((c) => (
          <button
            key={c}
            className={`${dt.costColToggleBtn} ${col === c ? dt.costColToggleBtnActive : ""}`}
            onClick={() => setCol(c)}
          >
            {COL_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Desktop: full 4-column table */}
      <table className={`${dt.costTable} ${dt.costTableDesktop}`}>
        <thead>
          <tr>
            <th>Item</th>
            <th>Peak</th>
            <th>Shoulder</th>
            <th>Off-Season</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                {row.line}
                {row.optional && <span className={dt.costOptional}>(optional)</span>}
              </td>
              <td>{row.peak}</td>
              <td>{row.shoulder}</td>
              <td>{row.offSeason}</td>
            </tr>
          ))}
          {hasTotal && (
            <tr className={dt.costTableTotal}>
              <td>Total (est.)</td>
              <td>{totalPeak}</td>
              <td>{totalShoulder}</td>
              <td>{totalOffSeason}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Mobile: 2-column table with toggle */}
      <table className={`${dt.costTable} ${dt.costTableMobile}`}>
        <thead>
          <tr>
            <th>Item</th>
            <th>{COL_LABELS[col]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                {row.line}
                {row.optional && <span className={dt.costOptional}>(optional)</span>}
              </td>
              <td>{row[col]}</td>
            </tr>
          ))}
          {hasTotal && (
            <tr className={dt.costTableTotal}>
              <td>Total (est.)</td>
              <td>{colTotal}</td>
            </tr>
          )}
        </tbody>
      </table>

      {costNote && <p className={dt.costNote}>{costNote}</p>}
    </>
  );
}
