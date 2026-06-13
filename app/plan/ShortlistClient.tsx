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
} from "@/lib/filters";
import {
  type TripOption,
  type Destination,
  type FilterState,
  type SortKey,
  type TripWhen,
  EMPTY_FILTERS,
  EMPTY_WHEN,
  TOP_100_MINS,
  SORT_OPTIONS,
  makeid,
  dollars,
  applyFilters,
  hasActiveFilters,
  orderGridTrips,
  useCaddie,
  TripModal,
  WishlistBadge,
  WhenPicker,
  assessTiming,
  TimingBadge,
} from "./planShared";

export type { TripOption };

// Persisted "My Trip" working state, so it survives leaving/returning the page.
const TRIP_STORAGE_KEY = "gti-plan-trip-v1";

export default function ShortlistClient({
  trips,
  wishlistSlugs = [],
  isLoggedIn = false,
}: {
  trips: TripOption[];
  wishlistSlugs?: string[];
  isLoggedIn?: boolean;
}) {
  const caddie = useCaddie({ trips, wishlistSlugs });

  // Filters
  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("ranking");
  const hasAnyFilter = hasActiveFilters(filterState);
  const wishlistSet = useMemo(() => new Set(wishlistSlugs), [wishlistSlugs]);

  // Caddie thread expansion
  const [threadOpen, setThreadOpen] = useState(false);

  // Group / dates / destinations (right rail)
  const [playerCount, setPlayerCount] = useState(4);
  const [nightCount, setNightCount] = useState(4);
  const [tripWhen, setTripWhen] = useState<TripWhen>(EMPTY_WHEN);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Planning prompt — shown whenever the trip list goes from empty to one trip
  const [planPopupOpen, setPlanPopupOpen] = useState(false);
  const [popGolfers, setPopGolfers] = useState(4);
  const [popNights, setPopNights] = useState(4);
  const [popWhen, setPopWhen] = useState<TripWhen>(EMPTY_WHEN);

  // Share-with-group
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareInfo, setShareInfo] = useState<{ id: string; url: string } | null>(null);

  // Modal + filter portal
  const [modalTrip, setModalTrip] = useState<TripOption | null>(null);
  const [portalMenu, setPortalMenu] = useState<{ id: string; top: number; left?: number; right?: number } | null>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const vibeOptions = useMemo(() => {
    const set = new Set<string>();
    trips.forEach((t) => t.vibe?.forEach((v) => set.add(v)));
    return Array.from(set).sort();
  }, [trips]);

  // Derived grid: filters narrow the live set, then order it (wishlist-pinned
  // ranking by default; explicit sorts otherwise).
  const gridTrips = useMemo(
    () => orderGridTrips(applyFilters(caddie.currentTrips, filterState), sortKey, wishlistSlugs, caddie.isCaddiePicks),
    [caddie.currentTrips, filterState, sortKey, wishlistSlugs, caddie.isCaddiePicks]
  );

  useEffect(() => {
    if (threadOpen && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [caddie.messages, threadOpen]);

  useEffect(() => {
    if (!modalTrip) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModalTrip(null); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [modalTrip]);

  useEffect(() => {
    if (!planPopupOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPlanPopupOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [planPopupOpen]);

  // Restore the saved trip on mount. Deliberately a mount effect (not a lazy
  // initializer) so SSR renders defaults and the client hydrates from storage
  // afterward — avoids a hydration mismatch on the rail.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore of persisted client state */
    try {
      const raw = localStorage.getItem(TRIP_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.playerCount === "number") setPlayerCount(saved.playerCount);
        if (typeof saved.nightCount === "number") setNightCount(saved.nightCount);
        if (saved.tripWhen && typeof saved.tripWhen === "object") setTripWhen({ ...EMPTY_WHEN, ...saved.tripWhen });
        if (Array.isArray(saved.destinations)) setDestinations(saved.destinations);
      }
    } catch {
      /* ignore corrupt/unavailable storage */
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Persist the trip whenever it changes (only after the initial restore).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        TRIP_STORAGE_KEY,
        JSON.stringify({ playerCount, nightCount, tripWhen, destinations }),
      );
    } catch {
      /* ignore storage write failures (quota, private mode) */
    }
  }, [hydrated, playerCount, nightCount, tripWhen, destinations]);

  useEffect(() => {
    if (!portalMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!portalMenuRef.current?.contains(t) && !t.closest("[data-filter-trigger]")) setPortalMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [portalMenu]);

  // ── Filter handlers ─────────────────────────────────────────────────────────

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

  function openFilterMenu(id: string, e: React.MouseEvent<HTMLButtonElement>, rightAlign = false) {
    if (portalMenu?.id === id) { setPortalMenu(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setPortalMenu({
      id,
      top: rect.bottom + 6,
      ...(rightAlign ? { right: window.innerWidth - rect.right } : { left: rect.left }),
    });
  }

  // ── Rail handlers ─────────────────────────────────────────────────────────

  function addDestination(trip: TripOption) {
    if (destinations.some((d) => d.slug === trip.slug)) return;
    const isFirstTrip = destinations.length === 0;
    setDestinations((prev) => [
      ...prev,
      { id: makeid(), slug: trip.slug, name: trip.name, overallRating: trip.overallRating, costTier: trip.costTier },
    ]);
    // Empty → first trip: prompt for group basics, prefilled from the rail if set.
    if (isFirstTrip) {
      setPopGolfers(playerCount);
      setPopNights(nightCount);
      setPopWhen(tripWhen);
      setPlanPopupOpen(true);
    }
  }

  // Commit the popup's Golfers / Nights / When back to the rail.
  function applyPlanPopup() {
    setPlayerCount(popGolfers);
    setNightCount(popNights);
    setTripWhen(popWhen);
    setPlanPopupOpen(false);
  }

  const canShare = destinations.length >= 1;

  async function handleShare() {
    if (sharing) return;
    setShareError("");
    // Logged-out: send them to register, then back to /plan (trip persists locally).
    if (!isLoggedIn) {
      window.location.href = `/register?callbackUrl=${encodeURIComponent("/plan")}`;
      return;
    }
    setSharing(true);
    try {
      const res = await fetch("/api/plan/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: { destinations, golfers: playerCount, nights: nightCount, when: tripWhen },
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setShareInfo({ id: data.id, url: data.url });
      } else {
        setShareError(data.error || "Could not save your trip.");
      }
    } catch {
      setShareError("Could not save your trip. Try again.");
    } finally {
      setSharing(false);
    }
  }

  function submit() {
    setThreadOpen(true);
    caddie.sendQuery(caddie.input, hasAnyFilter ? applyFilters(trips, filterState).map((t) => t.slug) : null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.planPage}>
      <div className={styles.planLayout}>

        {/* ── MAIN: Browse canvas ────────────────────────────────── */}
        <div className={styles.planMain}>
          <div className={styles.browsePanel}>

            {/* Filter toolbar */}
            <div className={styles.browseToolbar}>
              <div className={styles.browseFilters}>
                <FilterPill label="Region" count={filterState.region.length}
                  single={REGIONS.find((r) => r.slug === filterState.region[0])?.label}
                  onClick={(e) => openFilterMenu("region", e)} />
                <FilterPill label="Budget" count={filterState.budget.length}
                  single={COST_TIERS.find((c) => c.slug === filterState.budget[0])?.label}
                  onClick={(e) => openFilterMenu("budget", e)} />
                <FilterPill label="Duration" count={filterState.duration.length}
                  single={DURATION_RANGES.find((d) => d.slug === filterState.duration[0])?.label}
                  onClick={(e) => openFilterMenu("duration", e)} />
                {vibeOptions.length > 0 && (
                  <FilterPill label="Vibe" count={filterState.vibe.length}
                    single={filterState.vibe[0]}
                    onClick={(e) => openFilterMenu("vibe", e)} />
                )}
                <button
                  data-filter-trigger
                  className={`${styles.filterTrigger} ${filterState.top100 > 0 ? styles.filterTriggerActive : ""}`}
                  onClick={(e) => openFilterMenu("top100", e)}
                >
                  {filterState.top100 > 0 ? `Top 100: ${filterState.top100}+` : "Top 100"}
                  <span className={styles.filterCaret}>▾</span>
                </button>
                {(hasAnyFilter || caddie.isCaddiePicks) && (
                  <button className={styles.filterClearBtn} onClick={resetAll}>Reset</button>
                )}
              </div>

              <div className={styles.browseToolbarRight}>
                <span className={styles.browseCount}>
                  {gridTrips.length} {gridTrips.length === 1 ? "trip" : "trips"}
                </span>
                <label className={styles.sortControl}>
                  <span className={styles.sortLabel}>Sort</span>
                  <select
                    className={styles.sortSelect}
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {caddie.isCaddiePicks && (
              <div className={styles.picksBanner}>
                Showing the Caddie&apos;s picks for your request.
                <button className={styles.picksBannerLink} onClick={resetAll}>Browse all trips</button>
              </div>
            )}

            {/* Card grid (scrolls) */}
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
                          <span className={styles.chatTripMeta}>
                            {[t.region, dollars(t.costTier)].filter(Boolean).join(" · ")}
                          </span>
                          <div className={styles.chatTripFoot}>
                            {t.overallRating != null && (
                              <span className={styles.chatTripRating}>{t.overallRating.toFixed(2)}</span>
                            )}
                            <button
                              className={styles.chatTripAdd}
                              disabled={added}
                              onClick={(e) => { e.stopPropagation(); addDestination(t); }}
                            >
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

          {/* ── GTI Caddie — its own section below the listing ───────── */}
          <div className={styles.caddiePanel}>
            <div className={styles.caddiePanelHead}>
              <img src="/gti-avatar-thumb.png" alt="" aria-hidden="true" className={styles.caddieHeadAvatar} />
              <div className={styles.caddieHeadText}>
                <div className={styles.caddieHeadName}>GTI Caddie</div>
                <div className={styles.caddieHeadRole}>Find your next golf trip</div>
              </div>
              <button className={styles.caddieHeadToggle} onClick={() => setThreadOpen((o) => !o)}>
                {threadOpen ? "Hide chat ▾" : "Open chat ▴"}
              </button>
            </div>

            {threadOpen ? (
              <div className={styles.caddieThread} ref={threadRef}>
                {caddie.messages.map((m) => (
                  <div key={m.id} className={`${styles.caddieMsg} ${m.role === "user" ? styles.caddieMsgUser : ""}`}>
                    <div className={styles.caddieMsgRole}>{m.role === "user" ? "You" : "GTI Caddie"}</div>
                    <div className={styles.caddieMsgContent}>
                      <CaddieMarkdown content={m.content} trips={trips} onOpenTrip={setModalTrip} />
                    </div>
                  </div>
                ))}
                {caddie.sending && (
                  <div className={styles.caddieThinking}><span /><span /><span /></div>
                )}
              </div>
            ) : (
              <button className={styles.caddieLastAnswer} onClick={() => setThreadOpen(true)}>
                <span className={styles.caddieLastAnswerText}>
                  {caddie.sending ? "Thinking…" : (caddie.lastAssistant?.content ?? "Ask me anything about these trips.").replace(/[#*[\]()]/g, "")}
                </span>
              </button>
            )}

            <div className={styles.caddieComposer}>
              <input
                className={styles.caddieInput}
                value={caddie.input}
                onChange={(e) => {
                  // Expand the thread the moment they start typing a message.
                  if (e.target.value && !caddie.input) setThreadOpen(true);
                  caddie.setInput(e.target.value);
                }}
                placeholder="Ask about regions, budget, courses, timing…"
                disabled={caddie.sending}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              />
              <button className={styles.caddieSendBtn} onClick={submit} disabled={caddie.sending || !caddie.input.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT RAIL: My Trip ────────────────────────────────── */}
        <MyTripRail
          playerCount={playerCount} setPlayerCount={setPlayerCount}
          nightCount={nightCount} setNightCount={setNightCount}
          tripWhen={tripWhen} setTripWhen={setTripWhen}
          destinations={destinations} setDestinations={setDestinations}
          canShare={canShare}
          onShare={handleShare} sharing={sharing} shareError={shareError}
        />

      </div>

      {/* ── Filter portal menu (drops down) ──────────────────────── */}
      {portalMenu && createPortal(
        <div
          ref={portalMenuRef}
          className={`${styles.filterMenu} ${styles.filterMenuDown}`}
          style={{
            position: "fixed",
            top: portalMenu.top,
            ...(portalMenu.right !== undefined ? { right: portalMenu.right } : { left: portalMenu.left }),
            zIndex: 9999,
          }}
        >
          {portalMenu.id === "region" && REGIONS.map((r) => (
            <MenuItem key={r.slug} active={filterState.region.includes(r.slug)} onClick={() => toggleFilter("region", r.slug)} label={r.label} />
          ))}
          {portalMenu.id === "budget" && COST_TIERS.map((c) => (
            <MenuItem key={c.slug} active={filterState.budget.includes(c.slug)} onClick={() => toggleFilter("budget", c.slug)} label={c.label} sub={c.display} />
          ))}
          {portalMenu.id === "duration" && DURATION_RANGES.map((d) => (
            <MenuItem key={d.slug} active={filterState.duration.includes(d.slug)} onClick={() => toggleFilter("duration", d.slug)} label={d.label} sub={d.description} />
          ))}
          {portalMenu.id === "vibe" && vibeOptions.map((v) => (
            <MenuItem key={v} active={filterState.vibe.includes(v)} onClick={() => toggleFilter("vibe", v)} label={v} />
          ))}
          {portalMenu.id === "top100" && TOP_100_MINS.map((n) => (
            <MenuItem
              key={n}
              active={filterState.top100 === n}
              onClick={() => setFilterState((p) => ({ ...p, top100: p.top100 === n ? 0 : n }))}
              label={`${n}+`}
            />
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

      {/* ── First-add planning popup ───────────────────────────── */}
      {planPopupOpen && (
        <PlanStartModal
          golfers={popGolfers} setGolfers={setPopGolfers}
          nights={popNights} setNights={setPopNights}
          when={popWhen} setWhen={setPopWhen}
          onStart={applyPlanPopup}
          onAddMore={applyPlanPopup}
          onClose={() => setPlanPopupOpen(false)}
        />
      )}

      {/* ── Share-with-group modal ─────────────────────────────── */}
      {shareInfo && (
        <ShareModal
          shareId={shareInfo.id}
          shareUrl={shareInfo.url}
          destinationCount={destinations.length}
          onClose={() => setShareInfo(null)}
        />
      )}

    </div>
  );
}

// ── Share-with-group modal ──────────────────────────────────────────────────────

function ShareModal({
  shareId, shareUrl, destinationCount, onClose,
}: {
  shareId: string;
  shareUrl: string;
  destinationCount: number;
  onClose: () => void;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentCount, setSentCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  function addEmail(raw: string) {
    const e = raw.trim().replace(/,$/, "");
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setError(`That doesn't look like an email: ${e}`); return; }
    if (!emails.includes(e)) setEmails((prev) => [...prev, e]);
    setInput("");
    setError("");
  }

  function onKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "Enter" || ev.key === "," || ev.key === " ") { ev.preventDefault(); addEmail(input); }
    else if (ev.key === "Backspace" && !input && emails.length) setEmails((prev) => prev.slice(0, -1));
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  async function send() {
    const list = input.trim() ? [...emails, input.trim()] : emails;
    const valid = list.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (valid.length === 0) { setError("Add at least one recipient."); return; }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/plan/share/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shareId, toEmails: valid, message }),
      });
      const data = await res.json();
      if (res.ok && data.ok) setSentCount(data.sent ?? valid.length);
      else setError(data.error || "Could not send.");
    } catch {
      setError("Could not send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalCard} ${styles.shareModalCard}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.planModalHead}>
          <h2 className={styles.planModalTitle}>Share with your group</h2>
          <p className={styles.planModalSub}>
            Your trip is saved. Send it to your buddies, or copy the link — no account needed to view.
          </p>
        </div>

        {sentCount > 0 ? (
          <div className={styles.shareSent}>
            <div className={styles.shareSentMark}>✓</div>
            <p className={styles.shareSentText}>Sent to {sentCount} {sentCount === 1 ? "person" : "people"}.</p>
            <button className={styles.planModalPrimary} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className={styles.shareBody}>
              <div className={styles.shareLinkRow}>
                <input className={styles.shareLinkInput} value={shareUrl} readOnly onFocus={(e) => e.target.select()} />
                <button className={styles.shareCopyBtn} onClick={copyLink}>{copied ? "Copied" : "Copy"}</button>
              </div>

              <label className={styles.shareLabel}>Email to</label>
              <div className={styles.shareChips}>
                {emails.map((e) => (
                  <span key={e} className={styles.shareChip}>
                    {e}
                    <button className={styles.shareChipX} onClick={() => setEmails((prev) => prev.filter((x) => x !== e))} aria-label={`Remove ${e}`}>×</button>
                  </span>
                ))}
                <input
                  className={styles.shareChipInput}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  onBlur={() => input.trim() && addEmail(input)}
                  placeholder={emails.length ? "" : "buddy@example.com"}
                  type="email"
                />
              </div>

              <label className={styles.shareLabel}>Message <span className={styles.optionalBadge}>Optional</span></label>
              <textarea
                className={styles.shareTextarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Found a${destinationCount > 1 ? " few options" : " trip"} for us — take a look and let me know what you think.`}
                rows={3}
              />

              {error && <p className={styles.shareErr}>{error}</p>}
            </div>

            <div className={styles.planModalActions}>
              <button className={styles.planModalPrimary} onClick={send} disabled={sending}>
                {sending ? "Sending…" : "Send"}
              </button>
              <button className={styles.planModalSecondary} onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── First-add planning popup ────────────────────────────────────────────────────

function PlanStartModal({
  golfers, setGolfers,
  nights, setNights,
  when, setWhen,
  onStart, onAddMore, onClose,
}: {
  golfers: number; setGolfers: React.Dispatch<React.SetStateAction<number>>;
  nights: number; setNights: React.Dispatch<React.SetStateAction<number>>;
  when: TripWhen; setWhen: React.Dispatch<React.SetStateAction<TripWhen>>;
  onStart: () => void;
  onAddMore: () => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalCard} ${styles.planModalCard}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.planModalHead}>
          <h2 className={styles.planModalTitle}>Trip added — set up your plan</h2>
          <p className={styles.planModalSub}>Confirm your group size and dates. You can change these anytime in My Trip.</p>
        </div>

        <div className={styles.planModalFields}>
          <div className={styles.planModalField}>
            <span className={styles.railSectionLabel}>Golfers</span>
            <div className={styles.stepper}>
              <button className={styles.stepperBtn} onClick={() => setGolfers((n) => Math.max(1, n - 1))} aria-label="Fewer golfers">−</button>
              <span className={styles.stepperVal}>{golfers}</span>
              <button className={styles.stepperBtn} onClick={() => setGolfers((n) => Math.min(24, n + 1))} aria-label="More golfers">+</button>
            </div>
          </div>

          <div className={styles.planModalField}>
            <span className={styles.railSectionLabel}>Nights</span>
            <div className={styles.stepper}>
              <button className={styles.stepperBtn} onClick={() => setNights((n) => Math.max(1, n - 1))} aria-label="Fewer nights">−</button>
              <span className={styles.stepperVal}>{nights}</span>
              <button className={styles.stepperBtn} onClick={() => setNights((n) => Math.min(14, n + 1))} aria-label="More nights">+</button>
            </div>
          </div>

          <div className={`${styles.planModalField} ${styles.planModalFieldStacked}`}>
            <span className={styles.railSectionLabel}>
              When <span className={styles.optionalBadge}>Optional</span>
            </span>
            <WhenPicker value={when} onChange={setWhen} nights={nights} />
          </div>
        </div>

        <div className={styles.planModalActions}>
          <button className={styles.planModalPrimary} onClick={onStart}>Start Planning</button>
          <button className={styles.planModalSecondary} onClick={onAddMore}>Add More Trips to Vote</button>
        </div>
      </div>
    </div>
  );
}

// ── Small shared sub-components ─────────────────────────────────────────────────

function FilterPill({
  label, count, single, onClick,
}: {
  label: string;
  count: number;
  single?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      data-filter-trigger
      className={`${styles.filterTrigger} ${count > 0 ? styles.filterTriggerActive : ""}`}
      onClick={onClick}
    >
      {count === 0 ? label : count === 1 ? (single ?? label) : `${label} (${count})`}
      <span className={styles.filterCaret}>▾</span>
    </button>
  );
}

function MenuItem({
  active, onClick, label, sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <button className={`${styles.filterMenuItem} ${active ? styles.filterMenuItemActive : ""}`} onClick={onClick}>
      {active && <span className={styles.filterMenuCheck}>✓</span>}
      {label}
      {sub && <span className={styles.filterMenuSub}>{sub}</span>}
    </button>
  );
}

export function CaddieMarkdown({
  content, trips, onOpenTrip,
}: {
  content: string;
  trips: TripOption[];
  onOpenTrip: (t: TripOption) => void;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) => url}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith("trip:")) {
            const trip = trips.find((t) => t.slug === href!.slice(5));
            if (trip) {
              return <button className={styles.caddieLink} onClick={() => onOpenTrip(trip)}>{children}</button>;
            }
          }
          return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── My Trip rail ────────────────────────────────────────────────────────────────

export function MyTripRail({
  playerCount, setPlayerCount,
  nightCount, setNightCount,
  tripWhen, setTripWhen,
  destinations, setDestinations,
  canShare,
  onShare, sharing = false, shareError = "",
}: {
  playerCount: number; setPlayerCount: React.Dispatch<React.SetStateAction<number>>;
  nightCount: number; setNightCount: React.Dispatch<React.SetStateAction<number>>;
  tripWhen: TripWhen; setTripWhen: React.Dispatch<React.SetStateAction<TripWhen>>;
  destinations: Destination[]; setDestinations: React.Dispatch<React.SetStateAction<Destination[]>>;
  canShare: boolean;
  onShare?: () => void;
  sharing?: boolean;
  shareError?: string;
}) {
  return (
    <aside className={styles.tripRail}>
      <div className={styles.railHead}>
        <span className={styles.railTitle}>My Trip</span>
      </div>

      <div className={styles.railBody}>
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

        <div className={styles.railSection}>
          <div className={styles.railSectionRow}>
            <div className={styles.railSectionLabel}>
              When <span className={styles.optionalBadge}>Optional</span>
            </div>
          </div>
          <WhenPicker value={tripWhen} onChange={setTripWhen} nights={nightCount} />
        </div>

        <div className={styles.railSection}>
          <div className={styles.railSectionRow}>
            <div className={styles.railSectionLabel}>Destinations</div>
            {destinations.length > 0 && <span className={styles.destCount}>{destinations.length}</span>}
          </div>

          {destinations.length === 0 && (
            <div className={styles.railEmpty}>Add trips from the grid with&nbsp;+ Add.</div>
          )}
          {destinations.map((d) => (
            <div key={d.id} className={styles.destItem}>
              <img src={`/images/trips/${d.slug}.jpg`} alt={d.name} className={styles.destItemImg} />
              <div className={styles.destItemInfo}>
                <Link href={`/trips/${d.slug}`} target="_blank" rel="noopener noreferrer" className={styles.destItemName}>{d.name}</Link>
                <span className={styles.destItemMeta}>
                  {[dollars(d.costTier), d.overallRating != null ? d.overallRating.toFixed(2) : null].filter(Boolean).join(" · ")}
                </span>
              </div>
              <button className={styles.removeBtn} onClick={() => setDestinations((prev) => prev.filter((x) => x.id !== d.id))} aria-label="Remove destination">×</button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.railActions}>
        <button className={styles.primaryBtn} disabled={!canShare || sharing} onClick={onShare}>
          {sharing ? "Saving…" : "Share with group"}
        </button>
        <button className={styles.ghostBtn} disabled={destinations.length !== 1}>Plan this trip →</button>
        {!canShare ? (
          <p className={styles.shareHint}>Add at least 1 destination to continue.</p>
        ) : shareError ? (
          <p className={styles.shareErr}>{shareError}</p>
        ) : null}
      </div>
    </aside>
  );
}
