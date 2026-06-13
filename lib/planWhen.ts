// Server-safe formatter for a saved trip's "When" (season / month / specific
// dates). Mirrors app/plan/planShared.formatWhen but with no client deps, so it
// can be used in API routes and server components.

export type WhenLike = {
  mode?: string;
  season?: string;
  seasonYear?: string;
  monthNum?: string;
  monthYear?: string;
  startDate?: string;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatTripWhen(w: WhenLike | null | undefined, nights = 0): string {
  if (!w || !w.mode) return "";
  if (w.mode === "season") return w.season ? `${w.season}${w.seasonYear ? ` ${w.seasonYear}` : ""}` : "";
  if (w.mode === "month") {
    if (!w.monthNum) return "";
    const name = MONTH_NAMES[Number(w.monthNum) - 1] ?? "";
    return `${name}${w.monthYear ? ` ${w.monthYear}` : ""}`;
  }
  if (w.mode === "dates") {
    if (!w.startDate) return "";
    if (nights && nights > 0) {
      const e = new Date(w.startDate + "T00:00");
      e.setDate(e.getDate() + nights);
      return `${fmtDate(w.startDate)} – ${fmtDate(e.toISOString().slice(0, 10))}`;
    }
    return fmtDate(w.startDate);
  }
  return "";
}
