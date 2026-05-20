"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "@/styles/plan.module.css";
import {
  REGIONS,
  COST_TIERS,
  DURATION_RANGES,
  SEASONS,
  slugifyState,
} from "@/lib/filters";

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
  top100Count?: number;
  vibe?: string[];
  leadTime?: string;
  driving?: string;
};

type DateWindow = {
  id: string;
  startDate: string;
  endDate: string;
};

type Destination = {
  id: string;
  slug: string;
  name: string;
  overallRating: number | null;
  costTier: number | null;
};

type CaddieMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trips?: TripOption[];
};

// ── Filter state ──────────────────────────────────────────────────────────────

type FilterState = {
  region: string[];
  budget: string[];
  duration: string[];
  vibe: string[];
  season: string[];
  top100: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeid() {
  return Math.random().toString(36).slice(2, 10);
}

function dollars(n: number | null): string {
  if (!n || n < 1) return "";
  return "$".repeat(Math.min(5, Math.max(1, n)));
}

function formatDuration(min: number, max: number): string {
  if (!min && !max) return "";
  if (min && max && min !== max) return `${min}–${max} days`;
  return `${min ?? max} days`;
}

function formatDateRange(start: string, end: string): string {
  if (!start || !end) return "";
  const s = new Date(start + "T00:00");
  const e = new Date(end + "T00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sameYear = s.getFullYear() === e.getFullYear();
  const sf = s.toLocaleDateString("en-US", { ...opts, ...(sameYear ? {} : { year: "numeric" }) });
  const ef = e.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${sf} – ${ef}`;
}

function applyFilters(pool: TripOption[], fs: FilterState): TripOption[] {
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
        return def ? t.durationMinDays >= def.minDays && t.durationMinDays <= def.maxDays : false;
      })
    );
  if (fs.vibe.length > 0)
    result = result.filter((t) => fs.vibe.every((v) => t.vibe?.includes(v)));
  if (fs.season.length > 0)
    result = result.filter((t) =>
      fs.season.some((s) => {
        const def = SEASONS.find((x) => x.slug === s);
        return def ? t.seasons?.some((ts) => ts.toLowerCase() === def.label.toLowerCase()) : false;
      })
    );
  if (fs.top100)
    result = result
      .filter((t) => (t.top100Count ?? 0) >= 1)
      .sort((a, b) => (b.top100Count ?? 0) - (a.top100Count ?? 0));
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShortlistClient({ trips, wishlistSlugs = [] }: { trips: TripOption[]; wishlistSlugs?: string[] }) {
  const hasWishlist = wishlistSlugs.length > 0;

  // Caddie — seed message (text only) + persistent carousel state
  const [caddieMessages, setCaddieMessages] = useState<CaddieMsg[]>([{
    id: "seed",
    role: "assistant",
    content: hasWishlist
      ? "Welcome back! I've pulled up your wishlist below. Ask me anything about these trips, or tell me what you're looking for and I'll help you narrow it down."
      : "I'm your GTI Caddie. Search or filter down below and I'll recommend some options. I can also answer any questions about any destination. Here are some randomly selected trips to get you started.",
  }]);
  const [currentTrips, setCurrentTrips] = useState<TripOption[]>(() => {
    if (hasWishlist) {
      const bySlug = new Map(trips.map((t) => [t.slug, t]));
      const wishlisted = wishlistSlugs.map((s) => bySlug.get(s)).filter((t): t is TripOption => t !== undefined);
      if (wishlisted.length > 0) return wishlisted;
    }
    return [...trips].sort(() => Math.random() - 0.5);
  });
  const [carouselPage, setCarouselPage] = useState(0);
  const [caddieInput, setCaddieInput] = useState("");
  const [caddieSending, setCaddieSending] = useState(false);
  const caddieThreadRef = useRef<HTMLDivElement>(null);
  const caddieMainRef = useRef<HTMLDivElement>(null);
  const tripRailRef = useRef<HTMLElement>(null);
  const railBodyRef = useRef<HTMLDivElement>(null);

  // Group
  const [playerCount, setPlayerCount] = useState(4);
  const [nightCount, setNightCount] = useState(4);

  // Date windows (start date only — end inferred from nightCount)
  const [dateWindows, setDateWindows] = useState<DateWindow[]>([]);
  const [newDateStart, setNewDateStart] = useState("");
  const [addingDate, setAddingDate] = useState(false);

  // Destinations
  const [destinations, setDestinations] = useState<Destination[]>([]);

  // Filters
  const [filterState, setFilterState] = useState<FilterState>({
    region: [], budget: [], duration: [], vibe: [], season: [], top100: false,
  });
  // const [showHidden, setShowHidden] = useState(false); // HIDE FEATURE
  const [portalMenu, setPortalMenu] = useState<{
    id: string;
    bottom: number;
    left?: number;
    right?: number;
  } | null>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);

  const hasAnyFilter =
    filterState.region.length > 0 ||
    filterState.budget.length > 0 ||
    filterState.duration.length > 0 ||
    filterState.vibe.length > 0 ||
    filterState.season.length > 0 ||
    filterState.top100;

  const vibeOptions = useMemo(() => {
    const set = new Set<string>();
    trips.forEach((t) => t.vibe?.forEach((v) => set.add(v)));
    return Array.from(set).sort();
  }, [trips]);

  // HIDE FEATURE — excluded trips (commented out, kept for future use)
  // const [excluded, setExcluded] = useState<Set<string>>(new Set());
  // function excludeTrip(slug: string) {
  //   setExcluded((prev) => new Set([...prev, slug]));
  // }
  // function restoreTrip(slug: string) {
  //   setExcluded((prev) => { const next = new Set(prev); next.delete(slug); return next; });
  // }

  // Modal
  const [modalTrip, setModalTrip] = useState<TripOption | null>(null);

  useEffect(() => {
    const el = caddieThreadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [caddieMessages]);

  useEffect(() => {
    const panel = caddieMainRef.current;
    if (!panel) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (caddieThreadRef.current) caddieThreadRef.current.scrollTop += e.deltaY;
    };
    panel.addEventListener("wheel", onWheel, { passive: false });
    return () => panel.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const rail = tripRailRef.current;
      const body = railBodyRef.current;
      if (!rail || !body) return;
      if (!rail.contains(e.target as Node)) return;
      if (body.scrollHeight <= body.clientHeight) return;
      e.preventDefault();
      body.scrollTop += e.deltaY;
    };
    document.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  useEffect(() => {
    if (!modalTrip) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModalTrip(null); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [modalTrip]);

  // Close portal menu on outside click
  useEffect(() => {
    if (!portalMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      const inPortal = portalMenuRef.current?.contains(t);
      const isTrigger = !!t.closest("[data-filter-trigger]");
      if (!inPortal && !isTrigger) setPortalMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [portalMenu]);

  // Filters narrow the VIEW of currentTrips — they never replace it or send messages

  function toggleFilter(key: Exclude<keyof FilterState, "top100">, value: string) {
    setFilterState((prev) => {
      const arr = prev[key] as string[];
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  function toggleTop100() {
    setFilterState((prev) => ({ ...prev, top100: !prev.top100 }));
  }

  function clearFilters() {
    setFilterState({ region: [], budget: [], duration: [], vibe: [], season: [], top100: false });
  }

  function resetAll() {
    setFilterState({ region: [], budget: [], duration: [], vibe: [], season: [], top100: false });
    setCurrentTrips([...trips].sort(() => Math.random() - 0.5));
    setCarouselPage(0);
  }

  function openFilterMenu(id: string, e: React.MouseEvent<HTMLButtonElement>, rightAlign = false) {
    if (portalMenu?.id === id) { setPortalMenu(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setPortalMenu({
      id,
      bottom: window.innerHeight - rect.top + 6,
      ...(rightAlign ? { right: window.innerWidth - rect.right } : { left: rect.left }),
    });
  }

  // ── Caddie query engine ─────────────────────────────────────────────────────

  function resolveQuery(msg: string): { text: string; trips: TripOption[] } {
    const q = msg.toLowerCase();
    const addedSlugs = new Set(destinations.map((d) => d.slug));
    const pool = trips.filter((t) => !addedSlugs.has(t.slug));

    // All trips
    if (q.includes("all") || q === "show all" || q === "everything") {
      return { text: `Here are all ${pool.length} trips in the GTI index:`, trips: pool };
    }

    // Region match
    const regionMatch = REGIONS.find(
      (r) => q.includes(r.label.toLowerCase()) || q.includes(r.slug.replace(/-/g, " "))
    );
    if (regionMatch) {
      const found = pool.filter((t) => t.region && slugifyState(t.region) === regionMatch.slug);
      return {
        text: found.length > 0
          ? `${found.length} trip${found.length !== 1 ? "s" : ""} in the ${regionMatch.label}:`
          : `No trips in the ${regionMatch.label} right now — try another region.`,
        trips: found,
      };
    }

    // Budget / cost
    if (q.includes("budget") || q.includes("cheap") || q.includes("affordable")) {
      const found = pool.filter((t) => t.costTier <= 2);
      return { text: `${found.length} budget-friendly options ($ and $$):`, trips: found };
    }
    if (q.includes("luxury") || q.includes("high-end") || q.includes("splurge")) {
      const found = pool.filter((t) => t.costTier >= 4);
      return { text: `${found.length} premium and luxury options:`, trips: found };
    }
    if (q.includes("moderate") || q.includes("mid-range") || q.includes("$$$")) {
      const found = pool.filter((t) => t.costTier === 3);
      return { text: `${found.length} moderate-priced trips:`, trips: found };
    }

    // Duration
    if (q.includes("weekend") || q.match(/\b2[\s-]?day\b/) || q.match(/\b3[\s-]?day\b/)) {
      const found = pool.filter((t) => {
        const def = DURATION_RANGES.find((d) => d.slug === "weekend");
        return def ? t.durationMinDays >= def.minDays && t.durationMinDays <= def.maxDays : false;
      });
      return { text: `${found.length} weekend trip options (2–3 days):`, trips: found };
    }
    if (q.includes("week") || q.match(/\b7[\s-]?day\b/) || q.includes("long trip")) {
      const found = pool.filter((t) => t.durationMinDays >= 6);
      return { text: `${found.length} week-long trips:`, trips: found };
    }
    if (q.includes("4") || q.includes("5") || q.includes("4-5")) {
      const found = pool.filter((t) => t.durationMinDays >= 4 && t.durationMinDays <= 5);
      return { text: `${found.length} 4–5 day trips:`, trips: found };
    }

    // Top 100
    if (q.includes("top 100") || q.includes("top-100") || q.includes("ranked course") || q.includes("best course")) {
      const found = pool
        .filter((t) => (t.top100Count ?? 0) >= 1)
        .sort((a, b) => (b.top100Count ?? 0) - (a.top100Count ?? 0));
      return { text: `${found.length} trips with Top 100 ranked courses:`, trips: found };
    }

    // Season
    for (const season of SEASONS) {
      if (q.includes(season.label.toLowerCase())) {
        const found = pool.filter((t) => t.seasons?.some((s) => s.toLowerCase() === season.label.toLowerCase()));
        return { text: `${found.length} trips best in ${season.label}:`, trips: found };
      }
    }

    // Name / text search
    const nameMatches = pool.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.region && t.region.toLowerCase().includes(q)) ||
        t.vibe?.some((v) => v.toLowerCase().includes(q))
    );
    if (nameMatches.length > 0) {
      return { text: `Here's what I found for "${msg}":`, trips: nameMatches };
    }

    // Fallback
    return {
      text: `I didn't find a match for "${msg}". Try a region, budget level, duration, season, or ask about Top 100 courses.`,
      trips: [],
    };
  }

  async function sendQuery(msg: string) {
    const trimmed = msg.trim();
    if (!trimmed || caddieSending) return;

    const userMsgId = makeid();
    setCaddieMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: trimmed },
    ]);
    setCaddieInput("");
    setCaddieSending(true);

    // History: exclude seed and filter messages; cap at last 10 exchanges
    const history = caddieMessages
      .filter((m) => m.id !== "seed" && m.id !== "filter-user" && m.id !== "filter-result")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    // Filtered slugs: the full filter-matching universe from ALL trips (not just current carousel)
    const filteredSlugs = hasAnyFilter ? applyFilters(trips, filterState).map((t) => t.slug) : null;

    try {
      const res = await fetch("/api/plan/caddie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history, filteredSlugs }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { text, slugs } = await res.json();

      setCaddieMessages((prev) => [
        ...prev,
        { id: makeid(), role: "assistant", content: text },
      ]);

      if (slugs !== null) {
        // Validate against the full trips list; filter-narrowing happens in carouselAvailable
        const validSlugSet = new Set(trips.map((t) => t.slug));
        const resultTrips = (slugs as string[])
          .filter((s) => validSlugSet.has(s))
          .map((s) => trips.find((t) => t.slug === s))
          .filter((t): t is TripOption => t !== undefined);

        if (resultTrips.length > 0) {
          setCurrentTrips(resultTrips);
          setCarouselPage(0);
        }
      } else if (hasWishlist) {
        // Q&A response (no recommendations) — transition away from wishlist to full list
        setCurrentTrips([...trips].sort(() => Math.random() - 0.5));
        setCarouselPage(0);
      }
    } catch {
      setCaddieMessages((prev) => [
        ...prev,
        { id: makeid(), role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setCaddieSending(false);
    }
  }

  // ── Dest / date handlers ────────────────────────────────────────────────────

  function addDestination(trip: TripOption) {
    if (destinations.some((d) => d.slug === trip.slug)) return;
    setDestinations((prev) => [
      ...prev,
      { id: makeid(), slug: trip.slug, name: trip.name, overallRating: trip.overallRating, costTier: trip.costTier },
    ]);
  }

  function addDateWindow() {
    if (!newDateStart) return;
    const start = new Date(newDateStart + "T00:00");
    start.setDate(start.getDate() + nightCount);
    const endDate = start.toISOString().slice(0, 10);
    setDateWindows((prev) => [...prev, { id: makeid(), startDate: newDateStart, endDate }]);
    setNewDateStart("");
    setAddingDate(false);
  }

  const canShare = destinations.length >= 1;

  // Carousel derived state — filters narrow the view, never replace currentTrips
  const carouselAvailable = applyFilters(currentTrips, filterState); // HIDE FEATURE: also filter excluded
  const carouselTotalPages = Math.ceil(carouselAvailable.length / 3);
  const carouselPageClamped = carouselAvailable.length > 0
    ? Math.min(carouselPage, Math.max(0, carouselTotalPages - 1))
    : 0;
  const carouselPageTrips = carouselAvailable.slice(carouselPageClamped * 3, carouselPageClamped * 3 + 3);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.planPage}>
      <div className={styles.planLayout}>

        {/* ── MAIN: GTI Caddie ───────────────────────────────────── */}
        <div className={styles.planMain}>
          <div className={styles.caddieMain} ref={caddieMainRef}>

            {/* Header */}
            <div className={styles.caddieHead}>
              <img src="/gti-avatar-thumb.png" alt="" aria-hidden="true" className={styles.caddieAvatar} />
              <div>
                <div className={styles.caddieName}>GTI Caddie</div>
                <div className={styles.caddieRole}>Find your next golf trip</div>
              </div>
            </div>

            {/* Message thread */}
            <div className={styles.caddieThread} ref={caddieThreadRef}>
              {caddieMessages.map((m) => (
                <div key={m.id} className={`${styles.caddieMsg} ${m.role === "user" ? styles.caddieMsgUser : ""}`}>
                  <div className={styles.caddieMsgRole}>
                    {m.role === "user" ? "You" : "GTI Caddie"}
                  </div>
                  <div className={styles.caddieMsgContent}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={(url) => url}
                      components={{
                        a: ({ href, children }) => {
                          if (href?.startsWith("trip:")) {
                            const slug = href.slice(5);
                            const trip = trips.find((t) => t.slug === slug);
                            if (trip) {
                              return (
                                <button
                                  className={styles.caddieLink}
                                  onClick={() => setModalTrip(trip)}
                                >
                                  {children}
                                </button>
                              );
                            }
                          }
                          return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                        },
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>

                </div>
              ))}

              {caddieSending && (
                <div className={styles.caddieThinking}>
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>

            {/* Persistent carousel */}
            <div className={styles.carouselSection}>
              {carouselAvailable.length === 0 && currentTrips.length > 0 && hasAnyFilter ? (
                <div className={styles.carouselEmpty}>
                  Recommendations are filtered. Clear your filters to see them.
                </div>
              ) : carouselAvailable.length === 0 ? (
                <div className={styles.carouselEmpty}>No trips match. Try adjusting your filters.</div>
              ) : (
                <div className={styles.chatTripGrid}>
                  {carouselPageTrips.map((t) => {
                    const alreadyAdded = destinations.some((d) => d.slug === t.slug);
                    // const isHidden = excluded.has(t.slug); // HIDE FEATURE
                    return (
                      <div
                        key={t.slug}
                        className={`${styles.chatTripCard} ${alreadyAdded ? styles.chatTripCardAdded : ""}`}
                        // HIDE FEATURE: add ${isHidden ? styles.chatTripCardHidden : ""} to className
                        onClick={() => setModalTrip(t)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setModalTrip(t)}
                      >
                        <img
                          src={`/images/trips/${t.slug}.jpg`}
                          alt=""
                          aria-hidden="true"
                          className={styles.chatTripImg}
                        />
                        <div className={styles.chatTripBody}>
                          <span className={styles.chatTripName}>{t.name}</span>
                          <span className={styles.chatTripMeta}>
                            {[t.region, dollars(t.costTier)].filter(Boolean).join(" · ")}
                          </span>
                          <div className={styles.chatTripFoot}>
                            {t.overallRating != null && (
                              <span className={styles.chatTripRating}>{t.overallRating.toFixed(2)}</span>
                            )}
                            <div className={styles.chatTripActions}>
                              {/* HIDE FEATURE — replace the Add button below with isHidden ? Restore : (Hide + Add)
                              {isHidden ? (
                                <button className={styles.chatTripRestore} onClick={(e) => { e.stopPropagation(); restoreTrip(t.slug); }}>Restore</button>
                              ) : (
                                <>
                                  <button className={styles.chatTripHide} onClick={(e) => { e.stopPropagation(); excludeTrip(t.slug); }} title="Hide from recommendations">Hide</button>
                                  <button className={styles.chatTripAdd} disabled={alreadyAdded} onClick={(e) => { e.stopPropagation(); addDestination(t); }}>{alreadyAdded ? "Added" : "+ Add"}</button>
                                </>
                              )} */}
                              <button
                                className={styles.chatTripAdd}
                                disabled={alreadyAdded}
                                onClick={(e) => { e.stopPropagation(); addDestination(t); }}
                              >
                                {alreadyAdded ? "Added" : "+ Add"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Filter bar */}
            <div className={styles.filterBar} ref={filterBarRef}>

              <button
                data-filter-trigger
                className={`${styles.filterTrigger} ${filterState.region.length > 0 ? styles.filterTriggerActive : ""}`}
                onClick={(e) => openFilterMenu("region", e)}
              >
                {filterState.region.length === 0 ? "Region" : filterState.region.length === 1 ? (REGIONS.find((r) => r.slug === filterState.region[0])?.label ?? "Region") : `Region (${filterState.region.length})`}
                <span className={styles.filterCaret}>▾</span>
              </button>

              <button
                data-filter-trigger
                className={`${styles.filterTrigger} ${filterState.budget.length > 0 ? styles.filterTriggerActive : ""}`}
                onClick={(e) => openFilterMenu("budget", e)}
              >
                {filterState.budget.length === 0 ? "Budget" : filterState.budget.length === 1 ? (COST_TIERS.find((c) => c.slug === filterState.budget[0])?.label ?? "Budget") : `Budget (${filterState.budget.length})`}
                <span className={styles.filterCaret}>▾</span>
              </button>

              <button
                data-filter-trigger
                className={`${styles.filterTrigger} ${filterState.duration.length > 0 ? styles.filterTriggerActive : ""}`}
                onClick={(e) => openFilterMenu("duration", e)}
              >
                {filterState.duration.length === 0 ? "Duration" : filterState.duration.length === 1 ? (DURATION_RANGES.find((d) => d.slug === filterState.duration[0])?.label ?? "Duration") : `Duration (${filterState.duration.length})`}
                <span className={styles.filterCaret}>▾</span>
              </button>

              <button
                data-filter-trigger
                className={`${styles.filterTrigger} ${filterState.season.length > 0 ? styles.filterTriggerActive : ""}`}
                onClick={(e) => openFilterMenu("season", e)}
              >
                {filterState.season.length === 0 ? "Season" : filterState.season.length === 1 ? (SEASONS.find((s) => s.slug === filterState.season[0])?.label ?? "Season") : `Season (${filterState.season.length})`}
                <span className={styles.filterCaret}>▾</span>
              </button>

              {vibeOptions.length > 0 && (
                <button
                  data-filter-trigger
                  className={`${styles.filterTrigger} ${filterState.vibe.length > 0 ? styles.filterTriggerActive : ""}`}
                  onClick={(e) => openFilterMenu("vibe", e, true)}
                >
                  {filterState.vibe.length === 0 ? "Vibe" : filterState.vibe.length === 1 ? filterState.vibe[0] : `Vibe (${filterState.vibe.length})`}
                  <span className={styles.filterCaret}>▾</span>
                </button>
              )}

              <button
                className={`${styles.filterToggle} ${filterState.top100 ? styles.filterToggleActive : ""}`}
                onClick={toggleTop100}
              >
                Top 100
              </button>

              <button className={styles.filterClearBtn} onClick={resetAll}>
                Reset
              </button>

              {/* HIDE FEATURE — Show/Hide Hidden button
              {excluded.size > 0 && (
                <button
                  className={`${styles.filterToggle} ${styles.filterToggleFarRight} ${showHidden ? styles.filterToggleActive : ""}`}
                  onClick={() => setShowHidden((v) => !v)}
                >
                  {showHidden ? "Hide Hidden" : "Show Hidden"} ({excluded.size})
                </button>
              )} */}

              {carouselTotalPages > 1 && (
                <div className={`${styles.carouselNav} ${styles.carouselNavFarRight}`}>
                  <button
                    className={styles.carouselBtn}
                    onClick={() => setCarouselPage((p) => Math.max(0, p - 1))}
                    disabled={carouselPageClamped === 0}
                    aria-label="Previous"
                  >
                    ←
                  </button>
                  <span className={styles.carouselCount}>
                    {carouselPageClamped * 3 + 1}–{Math.min(carouselPageClamped * 3 + 3, carouselAvailable.length)} of {carouselAvailable.length}
                  </span>
                  <button
                    className={styles.carouselBtn}
                    onClick={() => setCarouselPage((p) => Math.min(carouselTotalPages - 1, p + 1))}
                    disabled={carouselPageClamped >= carouselTotalPages - 1}
                    aria-label="Next"
                  >
                    →
                  </button>
                </div>
              )}

            </div>

            {/* Composer */}
            <div className={styles.caddieComposer}>
              <input
                className={styles.caddieInput}
                value={caddieInput}
                onChange={(e) => setCaddieInput(e.target.value)}
                placeholder="Ask about regions, budget, courses, timing..."
                disabled={caddieSending}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendQuery(caddieInput);
                  }
                }}
              />
              <button
                className={styles.caddieSendBtn}
                onClick={() => sendQuery(caddieInput)}
                disabled={caddieSending || !caddieInput.trim()}
              >
                Send
              </button>
            </div>

          </div>
        </div>

        {/* ── RIGHT RAIL: My Trip ────────────────────────────────── */}
        <aside className={styles.tripRail} ref={tripRailRef}>
          <div className={styles.railHead}>
            <span className={styles.railTitle}>My Trip</span>
          </div>

          <div className={styles.railBody} ref={railBodyRef}>

            {/* Golfers + Nights */}
            <div className={styles.railSection}>
              <div className={styles.railStepperRow}>
                <div>
                  <div className={styles.railSectionLabel}>Golfers</div>
                  <div className={styles.stepper}>
                    <button className={styles.stepperBtn} onClick={() => setPlayerCount((n) => Math.max(1, n - 1))} aria-label="Remove player">−</button>
                    <span className={styles.stepperVal}>{playerCount}</span>
                    <button className={styles.stepperBtn} onClick={() => setPlayerCount((n) => Math.min(24, n + 1))} aria-label="Add player">+</button>
                  </div>
                </div>
                <div>
                  <div className={styles.railSectionLabel}>Nights</div>
                  <div className={styles.stepper}>
                    <button className={styles.stepperBtn} onClick={() => setNightCount((n) => Math.max(1, n - 1))} aria-label="Fewer nights">−</button>
                    <span className={styles.stepperVal}>{nightCount}</span>
                    <button className={styles.stepperBtn} onClick={() => setNightCount((n) => Math.min(14, n + 1))} aria-label="More nights">+</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className={styles.railSection}>
              <div className={styles.railSectionRow}>
                <div className={styles.railSectionLabel}>
                  Start Date <span className={styles.optionalBadge}>Optional</span>
                </div>
                {!addingDate && (
                  <button className={styles.railAddBtn} onClick={() => setAddingDate(true)}>
                    + Add
                  </button>
                )}
              </div>

              {addingDate && (
                <div className={styles.dateForm}>
                  <div className={styles.dateFormGroup}>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={newDateStart}
                      onChange={(e) => setNewDateStart(e.target.value)}
                    />
                  </div>
                  <div className={styles.dateFormActions}>
                    <button className={styles.confirmBtn} disabled={!newDateStart} onClick={addDateWindow}>
                      Add
                    </button>
                    <button
                      className={styles.cancelBtn}
                      onClick={() => { setAddingDate(false); setNewDateStart(""); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {dateWindows.length === 0 && !addingDate && (
                <div className={styles.railEmpty}>No dates added yet.</div>
              )}
              {dateWindows.map((w, i) => (
                <div key={w.id} className={styles.dateItem}>
                  <span className={styles.dateItemNum}>W{i + 1}</span>
                  <span className={styles.dateItemRange}>{formatDateRange(w.startDate, w.endDate)}</span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => setDateWindows((prev) => prev.filter((d) => d.id !== w.id))}
                    aria-label="Remove date"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Destinations */}
            <div className={styles.railSection}>
              <div className={styles.railSectionRow}>
                <div className={styles.railSectionLabel}>Destinations</div>
                {destinations.length > 0 && (
                  <span className={styles.destCount}>{destinations.length}</span>
                )}
              </div>

              {destinations.length === 0 && (
                <div className={styles.railEmpty}>
                  Ask the Caddie to find trips, then click&nbsp;+ Add.
                </div>
              )}
              {destinations.map((d) => (
                <div key={d.id} className={styles.destItem}>
                  <img src={`/images/trips/${d.slug}.jpg`} alt={d.name} className={styles.destItemImg} />
                  <div className={styles.destItemInfo}>
                    <Link href={`/trips/${d.slug}`} target="_blank" rel="noopener noreferrer" className={styles.destItemName}>
                      {d.name}
                    </Link>
                    <span className={styles.destItemMeta}>
                      {[dollars(d.costTier), d.overallRating != null ? d.overallRating.toFixed(2) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <button
                    className={styles.removeBtn}
                    onClick={() => setDestinations((prev) => prev.filter((x) => x.id !== d.id))}
                    aria-label="Remove destination"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

          </div>

          {/* Actions */}
          <div className={styles.railActions}>
            <button className={styles.primaryBtn} disabled={!canShare}>
              Share with group
            </button>
            <button className={styles.ghostBtn}>I&apos;ll choose myself →</button>
            {!canShare && (
              <p className={styles.shareHint}>Add at least 1 destination to continue.</p>
            )}
          </div>
        </aside>

      </div>

      {/* ── Filter portal menu ────────────────────────────────── */}
      {portalMenu && createPortal(
        <div
          ref={portalMenuRef}
          className={styles.filterMenu}
          style={{
            position: "fixed",
            bottom: portalMenu.bottom,
            ...(portalMenu.right !== undefined ? { right: portalMenu.right } : { left: portalMenu.left }),
            zIndex: 9999,
          }}
        >
          {portalMenu.id === "region" && REGIONS.map((r) => (
            <button
              key={r.slug}
              className={`${styles.filterMenuItem} ${filterState.region.includes(r.slug) ? styles.filterMenuItemActive : ""}`}
              onClick={() => toggleFilter("region", r.slug)}
            >{filterState.region.includes(r.slug) && <span className={styles.filterMenuCheck}>✓</span>}{r.label}</button>
          ))}
          {portalMenu.id === "budget" && COST_TIERS.map((c) => (
            <button
              key={c.slug}
              className={`${styles.filterMenuItem} ${filterState.budget.includes(c.slug) ? styles.filterMenuItemActive : ""}`}
              onClick={() => toggleFilter("budget", c.slug)}
            >{filterState.budget.includes(c.slug) && <span className={styles.filterMenuCheck}>✓</span>}{c.label} <span className={styles.filterMenuSub}>{c.display}</span></button>
          ))}
          {portalMenu.id === "duration" && DURATION_RANGES.map((d) => (
            <button
              key={d.slug}
              className={`${styles.filterMenuItem} ${filterState.duration.includes(d.slug) ? styles.filterMenuItemActive : ""}`}
              onClick={() => toggleFilter("duration", d.slug)}
            >{filterState.duration.includes(d.slug) && <span className={styles.filterMenuCheck}>✓</span>}{d.label} <span className={styles.filterMenuSub}>{d.description}</span></button>
          ))}
          {portalMenu.id === "season" && SEASONS.map((s) => (
            <button
              key={s.slug}
              className={`${styles.filterMenuItem} ${filterState.season.includes(s.slug) ? styles.filterMenuItemActive : ""}`}
              onClick={() => toggleFilter("season", s.slug)}
            >{filterState.season.includes(s.slug) && <span className={styles.filterMenuCheck}>✓</span>}{s.label}</button>
          ))}
          {portalMenu.id === "vibe" && vibeOptions.map((v) => (
            <button
              key={v}
              className={`${styles.filterMenuItem} ${filterState.vibe.includes(v) ? styles.filterMenuItemActive : ""}`}
              onClick={() => toggleFilter("vibe", v)}
            >{filterState.vibe.includes(v) && <span className={styles.filterMenuCheck}>✓</span>}{v}</button>
          ))}
        </div>,
        document.body
      )}

      {/* ── Trip detail modal ──────────────────────────────────── */}
      {modalTrip && (
        <TripModal
          trip={modalTrip}
          alreadyAdded={destinations.some((d) => d.slug === modalTrip.slug)}
          onAdd={() => { addDestination(modalTrip); setModalTrip(null); }}
          onClose={() => setModalTrip(null)}
        />
      )}

    </div>
  );
}

// ── Trip modal ────────────────────────────────────────────────────────────────

function TripModal({
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
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>

        {/* Hero image */}
        <div className={styles.modalHero}>
          <img src={`/images/trips/${trip.slug}.jpg`} alt={trip.name} className={styles.modalHeroImg} />
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Title + Add */}
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
          <button
            className={styles.modalAddBtn}
            onClick={onAdd}
            disabled={alreadyAdded}
          >
            {alreadyAdded ? "Added to trip" : "+ Add to trip"}
          </button>
        </div>

        {/* Details */}
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

        {/* Footer */}
        <div className={styles.modalFooter}>
          <Link href={`/trips/${trip.slug}`} target="_blank" rel="noopener noreferrer" className={styles.modalLink}>
            Read full GTI review →
          </Link>
        </div>

      </div>
    </div>
  );
}
