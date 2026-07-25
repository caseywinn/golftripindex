"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import styles from "@/styles/plan.module.css";
import { COST_TIERS, DURATION_RANGES, SEASONS, slugifyState } from "@/lib/filters";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TripOption = {
  slug: string;
  name: string;
  overallRating: number;
  durationMinDays: number;
  durationMaxDays: number;
  costTier: 1 | 2 | 3 | 4 | 5;
  region?: string;
  seasons?: string[];
  closedMonths?: string[];
  badMonths?: string[];
  top100Count?: number;
  vibe?: string[];
  leadTime?: string;
  driving?: string;
  currentRanking?: number | null;
  courseNames?: string[]; // for search-by-course; not shown on the card
};

export type DateWindow = {
  id: string;
  startDate: string;
  endDate: string;
};

// Trip timing — the user picks ONE of: a season, a month, or specific dates.
// All three sub-values are held so switching modes doesn't lose input; only the
// value matching `mode` is "active".
export type WhenMode = "season" | "month" | "dates";
export type TripWhen = {
  mode: WhenMode;
  season: string;     // SEASONS label, e.g. "Fall"
  seasonYear: string; // "YYYY" (optional refinement of the season)
  monthNum: string;   // "1".."12"
  monthYear: string;  // "YYYY" (optional refinement of the month)
  startDate: string;  // "YYYY-MM-DD" from <input type="date">
};

export const EMPTY_WHEN: TripWhen = {
  mode: "season", season: "", seasonYear: "", monthNum: "", monthYear: "", startDate: "",
};

export type Destination = {
  id: string;
  slug: string;
  name: string;
  overallRating: number | null;
  costTier: number | null;
};

export type CaddieMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type FilterState = {
  region: string[];
  budget: string[];
  duration: string[];
  vibe: string[];
  season: string[];
  top100: number; // minimum Top 100 courses (0 = off, 1–4)
};

export const EMPTY_FILTERS: FilterState = {
  region: [], budget: [], duration: [], vibe: [], season: [], top100: 0,
};

// Top 100 filter options (minimum count).
export const TOP_100_MINS = [1, 2, 3, 4];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function makeid() {
  return Math.random().toString(36).slice(2, 10);
}

// Standard modal wiring: Escape closes it, and page scroll is locked while it's
// open. Call this from inside a modal component that's mounted only when open —
// "mounted" then means "open", so the effect runs on open and, on unmount,
// removes the key listener and restores scrolling. Pass a close handler stable
// enough not to churn (identity changes only re-arm the same listener, harmless).
export function useModalDismiss(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
}

export function dollars(n: number | null): string {
  if (!n || n < 1) return "";
  return "$".repeat(Math.min(5, Math.max(1, n)));
}

export function formatDuration(min: number, max: number): string {
  if (!min && !max) return "";
  if (min && max && min !== max) return `${min}–${max} days`;
  return `${min ?? max} days`;
}

export function formatDateRange(start: string, end: string): string {
  if (!start || !end) return "";
  const s = new Date(start + "T00:00");
  const e = new Date(end + "T00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sameYear = s.getFullYear() === e.getFullYear();
  const sf = s.toLocaleDateString("en-US", { ...opts, ...(sameYear ? {} : { year: "numeric" }) });
  const ef = e.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${sf} – ${ef}`;
}

export function whenIsSet(w: TripWhen): boolean {
  return (
    (w.mode === "season" && !!w.season) ||
    (w.mode === "month" && !!w.monthNum) ||
    (w.mode === "dates" && !!w.startDate)
  );
}

// Human-readable timing. For specific dates, the end is inferred from `nights`.
export function formatWhen(w: TripWhen, nights?: number): string {
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
      return formatDateRange(w.startDate, e.toISOString().slice(0, 10));
    }
    return new Date(w.startDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return "";
}

// ── Seasonal playability (timing flags on trip cards) ─────────────────────────
// Heuristic: there's no explicit course-closure data, so we approximate from the
// trip's region (climate) plus its best seasons.

const SEASON_MONTHS: Record<string, number[]> = {
  Spring: [3, 4, 5],
  Summer: [6, 7, 8],
  Fall: [9, 10, 11],
  Winter: [12, 1, 2],
};

// Month numbers (1–12) implied by the When selection.
function selectedMonths(w: TripWhen, nights: number): number[] {
  if (w.mode === "season") return w.season ? (SEASON_MONTHS[w.season] ?? []) : [];
  if (w.mode === "month") return w.monthNum ? [Number(w.monthNum)] : [];
  if (w.mode === "dates" && w.startDate) {
    const start = new Date(w.startDate + "T00:00");
    const set = new Set<number>();
    for (let i = 0; i <= Math.max(1, nights); i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      set.add(d.getMonth() + 1);
    }
    return [...set];
  }
  return [];
}

function joinList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export type TimingFlag = { level: "error" | "warn"; message: string } | null;

// Uses the trip's Closed Months (red) and Bad Months (yellow) from Airtable.
export function assessTiming(trip: TripOption, when: TripWhen, nights = 0): TimingFlag {
  if (!whenIsSet(when)) return null;
  const monthNames = selectedMonths(when, nights).map((m) => MONTH_NAMES[m - 1]).filter(Boolean);
  if (monthNames.length === 0) return null;

  const closed = new Set(trip.closedMonths ?? []);
  const bad = new Set(trip.badMonths ?? []);

  // RED — any selected month is a Closed month.
  const closedHit = monthNames.filter((n) => closed.has(n));
  if (closedHit.length > 0) {
    return {
      level: "error",
      message: `Courses here are typically closed in ${joinList(closedHit)}. Pick another window.`,
    };
  }

  // YELLOW — any selected month is a Bad month (open, but not a good time).
  const badHit = monthNames.filter((n) => bad.has(n));
  if (badHit.length > 0) {
    return {
      level: "warn",
      message: `${joinList(badHit)} can be a poor time to visit here — courses are open, but conditions may not be ideal.`,
    };
  }

  return null;
}

export function hasActiveFilters(fs: FilterState): boolean {
  return (
    fs.region.length > 0 ||
    fs.budget.length > 0 ||
    fs.duration.length > 0 ||
    fs.vibe.length > 0 ||
    fs.season.length > 0 ||
    fs.top100 > 0
  );
}

export function activeFilterCount(fs: FilterState): number {
  return (
    fs.region.length +
    fs.budget.length +
    fs.duration.length +
    fs.vibe.length +
    fs.season.length +
    (fs.top100 > 0 ? 1 : 0)
  );
}

export function applyFilters(pool: TripOption[], fs: FilterState): TripOption[] {
  let result = [...pool];
  if (fs.region.length > 0)
    result = result.filter((t) => t.region && fs.region.includes(slugifyState(t.region)));
  if (fs.budget.length > 0) {
    const tiers = fs.budget.flatMap((s) => COST_TIERS.find((c) => c.slug === s)?.tiers ?? []);
    result = result.filter((t) => tiers.includes(t.costTier));
  }
  if (fs.duration.length > 0)
    result = result.filter((t) =>
      fs.duration.some((s) => {
        const def = DURATION_RANGES.find((d) => d.slug === s);
        // Bucket a trip by its longest length: "6+ days" keeps any trip that can
        // run 6+ days, even if its shorter option dips below (e.g. a 4–7 trip).
        return def ? t.durationMaxDays >= def.minDays && t.durationMaxDays <= def.maxDays : false;
      })
    );
  if (fs.vibe.length > 0)
    // OR-match: a trip carrying ANY selected vibe tag qualifies. Matches the
    // Caddie's vibe semantics, and lets an intake mood that expands to several
    // tags (e.g. "bachelor" → Bachelor Party / Party Atmosphere) be preselected
    // without the grid collapsing to trips that carry every one of them.
    result = result.filter((t) => fs.vibe.some((v) => t.vibe?.includes(v)));
  if (fs.season.length > 0)
    result = result.filter((t) =>
      fs.season.some((s) => {
        const def = SEASONS.find((x) => x.slug === s);
        return def ? t.seasons?.some((ts) => ts.toLowerCase() === def.label.toLowerCase()) : false;
      })
    );
  if (fs.top100 > 0)
    result = result
      .filter((t) => (t.top100Count ?? 0) >= fs.top100)
      .sort((a, b) => (b.top100Count ?? 0) - (a.top100Count ?? 0));
  return result;
}

// ── Sorting ───────────────────────────────────────────────────────────────────

export type SortKey = "ranking" | "rating" | "name" | "cost-asc" | "cost-desc";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  // "Top rated" (overallRating desc) was dropped as duplicative of Ranking — the
  // two are near-identical orderings. sortTrips still handles "rating" for any
  // internal caller; it's just not offered in the sort dropdown.
  { key: "ranking", label: "Ranking" },
  { key: "name", label: "Name (A–Z)" },
  { key: "cost-asc", label: "Price (low–high)" },
  { key: "cost-desc", label: "Price (high–low)" },
];

// Site ranking: lower Current Ranking = better; unranked sink to the bottom.
export function rankSort(a: TripOption, b: TripOption): number {
  return (a.currentRanking ?? 9999) - (b.currentRanking ?? 9999);
}

export function sortTrips(list: TripOption[], key: SortKey): TripOption[] {
  const out = [...list];
  switch (key) {
    case "ranking": out.sort(rankSort); break;
    case "rating": out.sort((a, b) => b.overallRating - a.overallRating); break;
    case "name": out.sort((a, b) => a.name.localeCompare(b.name)); break;
    case "cost-asc": out.sort((a, b) => a.costTier - b.costTier); break;
    case "cost-desc": out.sort((a, b) => b.costTier - a.costTier); break;
  }
  return out;
}

// Grid ordering for the default ("ranking") view: wishlist items pinned first
// (in wishlist order), then the rest by site ranking. Explicit sorts ignore the
// pin (the user chose that order). Caddie picks keep their incoming match order.
export function orderGridTrips(
  list: TripOption[],
  sortKey: SortKey,
  wishlistSlugs: string[],
  caddiePicks = false,
): TripOption[] {
  if (sortKey !== "ranking") return sortTrips(list, sortKey);
  if (caddiePicks) return list;
  if (wishlistSlugs.length === 0) return sortTrips(list, "ranking");

  const order = new Map(wishlistSlugs.map((s, i) => [s, i]));
  const wished: TripOption[] = [];
  const rest: TripOption[] = [];
  for (const t of list) (order.has(t.slug) ? wished : rest).push(t);
  wished.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
  rest.sort(rankSort);
  return [...wished, ...rest];
}

// Wishlist badge on a trip card — the same bookmark icon used by SaveButton on
// the trip list page (components/SaveButton.tsx → BookmarkIcon).
export function WishlistBadge() {
  return (
    <span className={styles.chatTripSaved} aria-label="On your wishlist" title="On your wishlist">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
    </span>
  );
}

// Red error / yellow warning badge for a trip's timing fit, with a custom
// hover tooltip portalled to <body> so it isn't clipped by the scrolling grid.
export function TimingBadge({ flag }: { flag: TimingFlag }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);
  if (!flag) return null;

  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 252) });
  }

  return (
    <span
      ref={ref}
      className={`${styles.timingBadge} ${flag.level === "error" ? styles.timingError : styles.timingWarn}`}
      onMouseEnter={show}
      onMouseLeave={() => setTip(null)}
      role="img"
      aria-label={flag.message}
    >
      !
      {tip && createPortal(
        <div
          className={`${styles.timingTip} ${flag.level === "error" ? styles.timingTipError : styles.timingTipWarn}`}
          style={{ position: "fixed", top: tip.top, left: tip.left, zIndex: 10000 }}
          role="tooltip"
        >
          {flag.message}
        </div>,
        document.body
      )}
    </span>
  );
}

// Wraps any element with a hover tooltip (portalled to body so it isn't clipped).
// Pass an empty `text` to disable the tooltip. For a disabled control inside,
// give it `pointer-events: none` so the hover reaches this wrapper.
export function HoverTip({
  text,
  className,
  children,
}: {
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);

  function show() {
    if (!text) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const centerX = r.left + r.width / 2;
    setTip({ top: r.top - 8, left: Math.min(Math.max(centerX, 128), window.innerWidth - 128) });
  }

  return (
    <span ref={ref} className={className} onMouseEnter={show} onMouseLeave={() => setTip(null)}>
      {children}
      {tip && createPortal(
        <div
          className={styles.hoverTip}
          style={{ position: "fixed", top: tip.top, left: tip.left, transform: "translate(-50%, -100%)", zIndex: 10000 }}
          role="tooltip"
        >
          {text}
        </div>,
        document.body
      )}
    </span>
  );
}

// ── Timing picker (Season / Month — pick one) ─────────────────────────────────
// The "Specific dates" mode and year refinements were removed from the input UI;
// the underlying TripWhen fields (startDate, seasonYear, monthYear) and the
// helpers that format them are kept so already-saved plans still render.

const WHEN_TABS: { mode: WhenMode; label: string }[] = [
  { mode: "season", label: "Season" },
  { mode: "month", label: "Month" },
];

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function WhenPicker({
  value,
  onChange,
}: {
  value: TripWhen;
  onChange: (w: TripWhen) => void;
}) {
  // Only Season and Month are selectable. A stale "dates" mode (old localStorage
  // or a previously shared plan) falls back to Season so the body never renders
  // empty; the season/month chips also re-assert `mode` so whenIsSet stays valid.
  const mode: "season" | "month" = value.mode === "month" ? "month" : "season";

  return (
    <div className={styles.whenPicker}>
      <div className={styles.whenTabs}>
        {WHEN_TABS.map((t) => (
          <button
            key={t.mode}
            type="button"
            className={`${styles.whenTab} ${mode === t.mode ? styles.whenTabActive : ""}`}
            onClick={() => onChange({ ...value, mode: t.mode })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "season" && (
        <div className={styles.whenSeasons}>
          {SEASONS.map((s) => (
            <button
              key={s.slug}
              type="button"
              className={`${styles.whenChip} ${value.season === s.label ? styles.whenChipActive : ""}`}
              onClick={() => onChange({ ...value, mode: "season", season: value.season === s.label ? "" : s.label })}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {mode === "month" && (
        <div className={styles.whenMonths}>
          {MONTH_ABBR.map((m, i) => {
            const mn = String(i + 1);
            return (
              <button
                key={mn}
                type="button"
                className={`${styles.whenChip} ${value.monthNum === mn ? styles.whenChipActive : ""}`}
                onClick={() => onChange({ ...value, mode: "month", monthNum: value.monthNum === mn ? "" : mn })}
              >
                {m}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Caddie engine hook ──────────────────────────────────────────────────────
// Shared by both /plan layouts: owns the conversation thread, the live
// recommendation set (currentTrips), and the API call. Layouts render it
// however they like — docked dock, slide-over, etc.

export function useCaddie({
  trips,
  wishlistSlugs,
}: {
  trips: TripOption[];
  wishlistSlugs: string[];
}) {
  const hasWishlist = wishlistSlugs.length > 0;

  const [messages, setMessages] = useState<CaddieMsg[]>([{
    id: "seed",
    role: "assistant",
    content: hasWishlist
      ? "Welcome back! Your saved trips are pinned to the top of the list. Ask me anything about them, or tell me what you're looking for and I'll help you narrow it down."
      : "I'm your GTI Caddie. Browse and filter the trips, or tell me what you're after — links golf, a buddies' weekend, Top 100 courses — and I'll pull the best matches.",
  }]);

  // Default view: every trip. Ordering (wishlist-first, then ranking) is applied
  // by orderGridTrips at render time, not here.
  const [currentTrips, setCurrentTrips] = useState<TripOption[]>(() => [...trips]);

  // Non-null once the grid has been narrowed to a specific set: "caddie" for a
  // chat recommendation, "intake" for the step-1 questionnaire. Drives both the
  // "browse all" affordance and the (source-specific) banner copy. Either way
  // orderGridTrips preserves the incoming match order.
  const [picksSource, setPicksSource] = useState<null | "caddie" | "intake">(null);

  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");

  // Map a slug list to trips, preserving the incoming order and dropping any
  // slug not in the catalog. Shared by the chat and the intake entry points.
  function pickTrips(slugs: string[]): TripOption[] {
    const bySlug = new Map(trips.map((t) => [t.slug, t]));
    return slugs.map((s) => bySlug.get(s)).filter((t): t is TripOption => t !== undefined);
  }

  function resetToAll() {
    setCurrentTrips([...trips]);
    setPicksSource(null);
  }

  // Narrow the grid to an explicit, pre-ordered slug list — e.g. the intake
  // questionnaire's server-side runFilter result. No conversation, no prose.
  // Set even when empty, so an over-constrained answer shows the "no matches,
  // reset" empty state rather than silently leaving the full catalog.
  function showPicks(slugs: string[], source: "caddie" | "intake" = "intake") {
    setCurrentTrips(pickTrips(slugs));
    setPicksSource(source);
  }

  async function sendQuery(msg: string, filteredSlugs: string[] | null) {
    const trimmed = msg.trim();
    if (!trimmed || sending) return;

    setMessages((prev) => [...prev, { id: makeid(), role: "user", content: trimmed }]);
    setInput("");
    setSending(true);

    const history = messages
      .filter((m) => m.id !== "seed")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/plan/caddie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history, filteredSlugs }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { text, slugs } = await res.json();

      setMessages((prev) => [...prev, { id: makeid(), role: "assistant", content: text }]);

      if (slugs !== null) {
        const resultTrips = pickTrips(slugs as string[]);
        if (resultTrips.length > 0) {
          setCurrentTrips(resultTrips);
          setPicksSource("caddie");
        }
      }
      // General Q&A (slugs === null): leave the current grid as-is.
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: makeid(), role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant") ?? null;

  return {
    messages,
    currentTrips,
    isCaddiePicks: picksSource !== null,
    picksSource,
    sending,
    input,
    setInput,
    sendQuery,
    showPicks,
    resetToAll,
    lastAssistant,
    hasWishlist,
  };
}

// ── Trip detail modal ─────────────────────────────────────────────────────────

export function TripModal({
  trip,
  alreadyAdded,
  onAdd,
  onClose,
}: {
  trip: TripOption;
  alreadyAdded: boolean;
  onAdd: () => void;
  onClose: () => void;
}) {
  useModalDismiss(onClose);
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHero}>
          <img src={`/images/trips/${trip.slug}.jpg`} alt={trip.name} className={styles.modalHeroImg} />
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={styles.modalTopBar}>
          <div>
            <h2 className={styles.modalTitle}>{trip.name}</h2>
            {trip.overallRating != null && (
              <div className={styles.modalRating}>
                <span className={styles.modalRatingNum}>{trip.overallRating.toFixed(2)}</span>
                <span className={styles.modalRatingLabel}>Overall Rating</span>
              </div>
            )}
          </div>
          <button className={styles.modalAddBtn} onClick={onAdd} disabled={alreadyAdded}>
            {alreadyAdded ? "Added to trip" : "+ Add to trip"}
          </button>
        </div>

        <div className={styles.modalDetails}>
          {trip.region && (
            <div className={styles.modalRow}>
              <span className={styles.modalRowLabel}>Region</span>
              <span className={styles.modalRowValue}>{trip.region}</span>
            </div>
          )}
          <div className={styles.modalRow}>
            <span className={styles.modalRowLabel}>Budget</span>
            <span className={styles.modalRowValue}>{dollars(trip.costTier) || "—"}</span>
          </div>
          <div className={styles.modalRow}>
            <span className={styles.modalRowLabel}>Duration</span>
            <span className={styles.modalRowValue}>{formatDuration(trip.durationMinDays, trip.durationMaxDays) || "—"}</span>
          </div>
          {trip.top100Count != null && trip.top100Count > 0 && (
            <div className={styles.modalRow}>
              <span className={styles.modalRowLabel}>Top 100 courses</span>
              <span className={styles.modalRowValue}>{trip.top100Count}</span>
            </div>
          )}
          {trip.seasons && trip.seasons.length > 0 && (
            <div className={styles.modalRow}>
              <span className={styles.modalRowLabel}>Best seasons</span>
              <div className={styles.modalPills}>
                {trip.seasons.map((s) => <span key={s} className={styles.modalPill}>{s}</span>)}
              </div>
            </div>
          )}
          {trip.vibe && trip.vibe.length > 0 && (
            <div className={styles.modalRow}>
              <span className={styles.modalRowLabel}>Vibe</span>
              <div className={styles.modalPills}>
                {trip.vibe.map((v) => <span key={v} className={styles.modalPill}>{v}</span>)}
              </div>
            </div>
          )}
          {trip.leadTime && (
            <div className={styles.modalRow}>
              <span className={styles.modalRowLabel}>Lead time</span>
              <span className={styles.modalRowValue}>{trip.leadTime}</span>
            </div>
          )}
          {trip.driving && (
            <div className={styles.modalRow}>
              <span className={styles.modalRowLabel}>Driving trip</span>
              <span className={styles.modalRowValue}>{trip.driving}</span>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <Link href={`/trips/${trip.slug}`} target="_blank" rel="noopener noreferrer" className={styles.modalLink}>
            Read full GTI review →
          </Link>
        </div>
      </div>
    </div>
  );
}
