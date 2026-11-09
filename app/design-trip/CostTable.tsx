import dt from "../../styles/designTrip.module.css";
import type { TripCostRow } from "@/lib/types";
import { costTotal, formatTotal } from "@/lib/tripCost";

export default function CostTable({ rows }: { rows: TripCostRow[] }) {
  const totalPeak = formatTotal(costTotal(rows, "peak"));
  const totalOffPeak = formatTotal(costTotal(rows, "offPeak"));

  return (
    <table className={dt.costTable}>
      <thead>
        <tr>
          <th>Per person · 3 nights</th>
          <th>Peak</th>
          <th>Off-Peak</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              {row.line}
              {row.note && <span className={dt.costLineNote}>({row.note})</span>}
            </td>
            <td>{row.peak}</td>
            <td>{row.offPeak}</td>
          </tr>
        ))}
        {(totalPeak || totalOffPeak) && (
          <tr className={dt.costTableTotal}>
            <td>Total (est.)</td>
            <td>{totalPeak}</td>
            <td>{totalOffPeak}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
