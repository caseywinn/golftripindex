"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import styles from "@/styles/plan.module.css";
import { REGIONS, COST_TIERS, DURATION_RANGES } from "@/lib/filters";
import {
  type TripOption,
  type TripWhen,
  type Destination,
  type FilterState,
  type SortKey,
  EMPTY_FILTERS,
  EMPTY_WHEN,
  TOP_100_MINS,
  SORT_OPTIONS,
  makeid,
  dollars,
  applyFilters,
  hasActiveFilters,
  activeFilterCount,
  orderGridTrips,
  useCaddie,
  TripModal,
  WishlistBadge,
  assessTiming,
  TimingBadge,
} from "../plan/planShared";
import { MyTripRail, CaddieMarkdown } from "../plan/ShortlistClient";

export default function Plan2Client({
  trips,
  wishlistSlugs = [],
}: {
  trips: TripOption[];
  wishlistSlugs?: string[];
}) {
  const caddie = useCaddie({ trips, wishlistSlugs });

  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("ranking");
  const hasAnyFilter = hasActiveFilters(filterState);
  const wishlistSet = useMemo(() => new Set(wishlistSlugs), [wishlistSlugs]);

  const [caddieOpen, setCaddieOpen] = useState(false);

  // Right rail state
  const [playerCount, setPlayerCount] = useState(4);
  const [nightCount, setNightCount] = useState(4);
  const [tripWhen, setTripWhen] = useState<TripWhen>(EMPTY_WHEN);
  const [destinations, setDestinations] = useState<Destination[]>([]);

  const [modalTrip, setModalTrip] = useState<TripOption | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const vibeOptions = useMemo(() => {
    const set = new Set<string>();
    trips.forEach((t) => t.vibe?.forEach((v) => set.add(v)));
    return Array.from(set).sort();
  }, [trips]);

  const gridTrips = useMemo(
    () => orderGridTrips(applyFilters(caddie.currentTrips, filterState), sortKey, wishlistSlugs, caddie.isCaddiePicks),
    [caddie.currentTrips, filterState, sortKey, wishlistSlugs, caddie.isCaddiePicks]
  );

  useEffect(() => {
    if (caddieOpen && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [caddie.messages, caddieOpen]);

  useEffect(() => {
    if (!modalTrip) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModalTrip(null); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [modalTrip]);

  function toggleFilter(key: Exclude<keyof FilterState, "top100">, value: string) {
    setFilterState((prev) => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  function resetAll() {
    setFilterState(EMPTY_FILTERS);
    setSortKey("ranking");
    caddie.resetToAll();
  }

  function addDestination(trip: TripOption) {
    if (destinations.some((d) => d.slug === trip.slug)) return;
    setDestinations((prev) => [
      ...prev,
      { id: makeid(), slug: trip.slug, name: trip.name, overallRating: trip.overallRating, costTier: trip.costTier },
    ]);
  }

  function submit() {
    caddie.sendQuery(caddie.input, hasAnyFilter ? applyFilters(trips, filterState).map((t) => t.slug) : null);
  }

  const canShare = destinations.length >= 1;
  const filterCount = activeFilterCount(filterState);

  return (
    <div className={styles.planPage}>
      <div className={styles.plan2Layout}>

        {/* ── Faceted filter sidebar ─────────────────────────────── */}
        <aside className={styles.facetSidebar}>
          <div className={styles.facetHead}>
            <span className={styles.facetHeadTitle}>Filters</span>
            {(filterCount > 0 || caddie.isCaddiePicks) && (
              <button className={styles.facetClear} onClick={resetAll}>Clear{filterCount > 0 ? ` (${filterCount})` : ""}</button>
            )}
          </div>

          <Facet title="Region">
            {REGIONS.map((r) => (
              <FacetItem key={r.slug} checked={filterState.region.includes(r.slug)} onChange={() => toggleFilter("region", r.slug)} label={r.label} />
            ))}
          </Facet>

          <Facet title="Budget">
            {COST_TIERS.map((c) => (
              <FacetItem key={c.slug} checked={filterState.budget.includes(c.slug)} onChange={() => toggleFilter("budget", c.slug)} label={c.label} sub={c.display} />
            ))}
          </Facet>

          <Facet title="Duration">
            {DURATION_RANGES.map((d) => (
              <FacetItem key={d.slug} checked={filterState.duration.includes(d.slug)} onChange={() => toggleFilter("duration", d.slug)} label={d.label} sub={d.description} />
            ))}
          </Facet>

          {vibeOptions.length > 0 && (
            <Facet title="Vibe">
              {vibeOptions.map((v) => (
                <FacetItem key={v} checked={filterState.vibe.includes(v)} onChange={() => toggleFilter("vibe", v)} label={v} />
              ))}
            </Facet>
          )}

          <Facet title="Top 100 courses">
            {TOP_100_MINS.map((n) => (
              <FacetItem
                key={n}
                checked={filterState.top100 === n}
                onChange={() => setFilterState((p) => ({ ...p, top100: p.top100 === n ? 0 : n }))}
                label={`${n}+`}
              />
            ))}
          </Facet>
        </aside>

        {/* ── Center: card grid ──────────────────────────────────── */}
        <div className={styles.plan2Center}>
          <div className={styles.plan2CenterHead}>
            <div className={styles.plan2HeadLeft}>
              <span className={styles.browseCount}>{gridTrips.length} {gridTrips.length === 1 ? "trip" : "trips"}</span>
              {caddie.isCaddiePicks && (
                <span className={styles.picksTag}>
                  Caddie picks
                  <button className={styles.picksBannerLink} onClick={resetAll}>browse all</button>
                </span>
              )}
            </div>
            <label className={styles.sortControl}>
              <span className={styles.sortLabel}>Sort</span>
              <select className={styles.sortSelect} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <div className={styles.cardGridScroll}>
            {gridTrips.length === 0 ? (
              <div className={styles.gridEmpty}>
                No trips match these filters. <button className={styles.picksBannerLink} onClick={resetAll}>Reset</button>
              </div>
            ) : (
              <div className={styles.cardGrid}>
                {gridTrips.map((t) => {
                  const added = destinations.some((d) => d.slug === t.slug);
                  const wished = wishlistSet.has(t.slug);
                  const timing = assessTiming(t, tripWhen, nightCount);
                  return (
                    <div
                      key={t.slug}
                      className={`${styles.chatTripCard} ${added ? styles.chatTripCardAdded : ""} ${wished ? styles.chatTripCardWishlist : ""}`}
                      onClick={() => setModalTrip(t)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setModalTrip(t)}
                    >
                      <img src={`/images/trips/${t.slug}.jpg`} alt="" aria-hidden="true" className={styles.chatTripImg} />
                      <TimingBadge flag={timing} />
                      {wished && <WishlistBadge />}
                      <div className={styles.chatTripBody}>
                        <span className={styles.chatTripName}>{t.name}</span>
                        <span className={styles.chatTripMeta}>{[t.region, dollars(t.costTier)].filter(Boolean).join(" · ")}</span>
                        <div className={styles.chatTripFoot}>
                          {t.overallRating != null && <span className={styles.chatTripRating}>{t.overallRating.toFixed(2)}</span>}
                          <button className={styles.chatTripAdd} disabled={added} onClick={(e) => { e.stopPropagation(); addDestination(t); }}>
                            {added ? "Added" : "+ Add"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right rail: My Trip ────────────────────────────────── */}
        <MyTripRail
          playerCount={playerCount} setPlayerCount={setPlayerCount}
          nightCount={nightCount} setNightCount={setNightCount}
          tripWhen={tripWhen} setTripWhen={setTripWhen}
          destinations={destinations} setDestinations={setDestinations}
          canShare={canShare}
        />
      </div>

      {/* ── Caddie launcher + slide-over ───────────────────────── */}
      {!caddieOpen && (
        <button className={styles.caddieLauncher} onClick={() => setCaddieOpen(true)}>
          <img src="/gti-avatar-thumb.png" alt="" aria-hidden="true" className={styles.caddieLauncherAvatar} />
          <span>Ask the Caddie</span>
        </button>
      )}

      {caddieOpen && (
        <>
          <div className={styles.caddieSlideBackdrop} onClick={() => setCaddieOpen(false)} />
          <div className={styles.caddieSlideOver}>
            <div className={styles.caddieSlideHead}>
              <span className={styles.caddieSlideTitle}>
                <img src="/gti-avatar-thumb.png" alt="" aria-hidden="true" className={styles.caddieDockAvatar} />
                GTI Caddie
              </span>
              <button className={styles.caddieThreadClose} onClick={() => setCaddieOpen(false)} aria-label="Close">×</button>
            </div>

            <div className={styles.caddieThread} ref={threadRef}>
              {caddie.messages.map((m) => (
                <div key={m.id} className={`${styles.caddieMsg} ${m.role === "user" ? styles.caddieMsgUser : ""}`}>
                  <div className={styles.caddieMsgRole}>{m.role === "user" ? "You" : "GTI Caddie"}</div>
                  <div className={styles.caddieMsgContent}>
                    <CaddieMarkdown content={m.content} trips={trips} onOpenTrip={setModalTrip} />
                  </div>
                </div>
              ))}
              {caddie.sending && <div className={styles.caddieThinking}><span /><span /><span /></div>}
            </div>

            <div className={styles.caddieComposer}>
              <input
                className={styles.caddieInput}
                value={caddie.input}
                onChange={(e) => caddie.setInput(e.target.value)}
                placeholder="Ask about regions, budget, courses, timing…"
                disabled={caddie.sending}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              />
              <button className={styles.caddieSendBtn} onClick={submit} disabled={caddie.sending || !caddie.input.trim()}>Send</button>
            </div>
          </div>
        </>
      )}

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

// ── Facet sub-components ────────────────────────────────────────────────────────

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.facetSection}>
      <div className={styles.facetSectionTitle}>{title}</div>
      <div className={styles.facetItems}>{children}</div>
    </div>
  );
}

function FacetItem({
  checked, onChange, label, sub,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <label className={`${styles.facetItem} ${checked ? styles.facetItemActive : ""}`}>
      <input type="checkbox" className={styles.facetCheckbox} checked={checked} onChange={onChange} />
      <span className={styles.facetItemLabel}>{label}</span>
      {sub && <span className={styles.facetSub}>{sub}</span>}
    </label>
  );
}
