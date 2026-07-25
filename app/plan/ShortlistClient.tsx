"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "@/styles/plan.module.css";
import {
  REGIONS,
  COST_TIERS,
  DURATION_RANGES,
} from "@/lib/filters";
import { VOTE_TYPES, type VoteType } from "@/lib/planVote";
import IntakeWizard, { INTAKE_STEP_COUNT } from "./IntakeWizard";
import { VIBE_CHOICES, type IntakeAnswers } from "@/lib/intake";
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
  formatDuration,
  applyFilters,
  hasActiveFilters,
  orderGridTrips,
  useCaddie,
  TripModal,
  WishlistBadge,
  WhenPicker,
  assessTiming,
  TimingBadge,
  useModalDismiss,
} from "./planShared";

export type { TripOption };

// Persisted "My Trip" working state, so it survives leaving/returning the page.
//
// Scoped per club so a personal shortlist and a club proposal can't bleed into
// each other: without this, opening /plan?club=x would load your private
// shortlist into the club's ballot, and proposing would then wipe it.
const TRIP_STORAGE_KEY = "gti-plan-trip-v1";
const storageKey = (club: { slug: string } | null) =>
  club ? `${TRIP_STORAGE_KEY}:club:${club.slug}` : TRIP_STORAGE_KEY;

// Remembers that a visitor has passed the step-1 intake (answered or skipped),
// so returning visitors aren't re-gated. Club-propose mode bypasses the gate.
const INTAKE_DONE_KEY = "gti-plan-intake-done-v1";

// Reflect the wizard's answers onto the browse filter chips, so after "View
// recommendations" the toolbar shows what was applied. Chips are shown but do
// NOT re-filter until the user touches one (the `intakePreset` guard) — the
// server result stays authoritative for the initial view, since the chips use
// coarser client-side semantics than the runFilter engine. Vibe expands to its
// underlying catalog tags (OR-matched).
//
// Only maps dimensions that have a toolbar chip. Season and golf-ambition (sort)
// have no chip in this layout, so they shape the server result but aren't
// mirrored — preselecting a chip that doesn't exist would be an invisible,
// unclearable filter once the preset guard lifts.
function filterStateFromAnswers(a: IntakeAnswers): FilterState {
  return {
    region: a.regions ?? [],
    budget: a.budget ? [a.budget] : [],
    duration: a.length ? [a.length] : [],
    season: [],
    vibe: (a.vibes ?? []).flatMap((slug) => VIBE_CHOICES.find((v) => v.slug === slug)?.tags ?? []),
    top100: a.ambition === "bucket-list" ? 1 : 0,
  };
}

export default function ShortlistClient({
  trips,
  wishlistSlugs = [],
  isLoggedIn = false,
  club = null,
}: {
  trips: TripOption[];
  wishlistSlugs?: string[];
  isLoggedIn?: boolean;
  /**
   * Set when proposing to a club (arrived via /plan?club=<slug>). Already
   * authorized server-side — its presence means the viewer manages this club.
   */
  club?: { slug: string; name: string } | null;
}) {
  const caddie = useCaddie({ trips, wishlistSlugs });

  // Step-1 intake gate, driven by the ?page= query param so the browser
  // Back/Forward buttons step through the wizard (page=1 → page=2 → … → results).
  //
  //  - `?page=N` (1-based) shows question N. This covers a first visit, the
  //    "Preferences" reopen, hitting Back from the results view, and the club
  //    "Propose a trip" link (which arrives at ?page=1).
  //  - No `?page=` in club-propose mode → straight to the shortlist (a club
  //    proposal without an explicit page skips the questionnaire).
  //  - No `?page=` and the personal intake already finished → results.
  //  - No `?page=` on a first personal visit → we redirect to `?page=1` so every
  //    question lives in history and Back works from the very start.
  //
  // `doneFlag` (whether the visitor has finished the intake before) is read from
  // localStorage in a mount effect — SSR and the first client render leave it
  // null ("pending" placeholder) so there's no hydration mismatch.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pageParam = searchParams.get("page");
  const [doneFlag, setDoneFlag] = useState<boolean | null>(null);
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);

  // Current 0-based question index from ?page=, clamped to a real step; null when
  // the param is absent or not a valid question number.
  const wizardStep = useMemo(() => {
    if (!pageParam) return null;
    const n = Number.parseInt(pageParam, 10);
    if (!Number.isFinite(n)) return null;
    return Math.min(Math.max(n - 1, 0), INTAKE_STEP_COUNT - 1);
  }, [pageParam]);

  // Resolve the gate: an explicit page param always shows the wizard (personal or
  // club-propose); otherwise club-propose goes straight to the shortlist, and a
  // personal visit waits for storage, then results (finished) or wizard (first).
  const intakeState: "pending" | "wizard" | "done" =
    wizardStep !== null
      ? "wizard"
      : club
        ? "done"
        : doneFlag === null
          ? "pending"
          : doneFlag
            ? "done"
            : "wizard";

  // History helpers that preserve club-propose mode across the ?page= changes —
  // dropping ?club= mid-wizard would silently kick a club proposal back to a
  // personal shortlist.
  const clubQuery = club ? `club=${encodeURIComponent(club.slug)}&` : "";
  const goToPage = (n: number) => router.push(`${pathname}?${clubQuery}page=${n}`);
  const finishIntake = () =>
    router.push(clubQuery ? `${pathname}?${clubQuery.replace(/&$/, "")}` : pathname);

  // Filters
  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("ranking");
  // Free-text search over trip names + course names (composes with the filters).
  const [searchQuery, setSearchQuery] = useState("");
  // True right after the wizard: chips mirror the answers but the grid stays the
  // untouched server result. Cleared the moment the user edits any filter, after
  // which the chips filter normally.
  const [intakePreset, setIntakePreset] = useState(false);
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
  const [planPopupTrip, setPlanPopupTrip] = useState<TripOption | null>(null);
  const [popGolfers, setPopGolfers] = useState(4);
  const [popNights, setPopNights] = useState(4);
  const [popWhen, setPopWhen] = useState<TripWhen>(EMPTY_WHEN);

  // Share-with-group
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareSetupOpen, setShareSetupOpen] = useState(false);
  const [shareInfo, setShareInfo] = useState<{ id: string; url: string; voteType: VoteType | null } | null>(null);

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
  // ranking by default; explicit sorts otherwise). While `intakePreset` holds,
  // the preselected chips are a preview only — the server's runFilter result is
  // shown unfiltered so its richer logic (e.g. season month-timing) isn't
  // re-narrowed by the coarser client filters.
  const gridTrips = useMemo(() => {
    const base = intakePreset ? caddie.currentTrips : applyFilters(caddie.currentTrips, filterState);
    const q = searchQuery.trim().toLowerCase();
    const searched = q
      ? base.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.courseNames?.some((c) => c.toLowerCase().includes(q))
        )
      : base;
    return orderGridTrips(searched, sortKey, wishlistSlugs, caddie.isCaddiePicks);
  }, [caddie.currentTrips, filterState, sortKey, wishlistSlugs, caddie.isCaddiePicks, intakePreset, searchQuery]);

  useEffect(() => {
    if (threadOpen && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [caddie.messages, threadOpen]);

  // Trip detail modal (TripModal) and the first-add planning popup (PlanStartModal)
  // handle their own Escape-to-close + scroll lock via useModalDismiss.

  // Restore the saved trip on mount. Deliberately a mount effect (not a lazy
  // initializer) so SSR renders defaults and the client hydrates from storage
  // afterward — avoids a hydration mismatch on the rail.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore of persisted client state */
    try {
      const raw = localStorage.getItem(storageKey(club));
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
    // `club` is a server prop fixed for the page load, so it can't change under
    // this one-time restore; re-running would clobber the rail with stored state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the trip whenever it changes (only after the initial restore).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        storageKey(club),
        JSON.stringify({ playerCount, nightCount, tripWhen, destinations }),
      );
    } catch {
      /* ignore storage write failures (quota, private mode) */
    }
  }, [hydrated, playerCount, nightCount, tripWhen, destinations, club]);

  // Resolve the intake gate on mount from localStorage (see intakeState above).
  // A first-time visitor with no ?page= is redirected to ?page=1 so the wizard's
  // very first question already has a history entry — Back works from the start.
  useEffect(() => {
    if (club) return;
    let done = false;
    try {
      done = !!localStorage.getItem(INTAKE_DONE_KEY);
    } catch {
      /* storage unavailable (private mode) — treat as first visit */
    }
    setDoneFlag(done);
    if (!done && !pageParam) router.replace(`${pathname}?page=1`);
    // `club` is a fixed server prop; this runs once to decide the gate. pageParam
    // is only read for the initial redirect decision, so it's intentionally not a
    // dependency (later param changes are handled by the derived intakeState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setIntakePreset(false); // editing a chip switches from preview to live filtering
    setFilterState((prev) => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  function resetAll() {
    setIntakePreset(false);
    setFilterState(EMPTY_FILTERS);
    setSearchQuery("");
    setSortKey("ranking");
    caddie.resetToAll();
  }

  function setTop100(n: number) {
    setIntakePreset(false);
    setFilterState((p) => ({ ...p, top100: p.top100 === n ? 0 : n }));
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
      setPlanPopupTrip(trip);
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

  // A club trip is always a vote, so it needs something to vote between.
  const canShare = club ? destinations.length >= 2 : destinations.length >= 1;

  // Entry point from the rail. Logged-out → register. With 2+ trips, let the
  // captain choose a group-vote format first; a single trip shares directly.
  function startShare() {
    setShareError("");
    if (!isLoggedIn) {
      const back = club ? `/plan?club=${encodeURIComponent(club.slug)}` : "/plan";
      window.location.href = `/register?callbackUrl=${encodeURIComponent(back)}`;
      return;
    }
    if (destinations.length >= 2) {
      setShareSetupOpen(true);
      return;
    }
    createShare(null, null);
  }

  // Persist the working trip as a shareable plan, optionally as a group vote.
  //
  // In club mode this posts to the club's propose route instead, which also
  // creates the club_trips row and seats the whole active roster. There's no
  // ShareModal afterward: the club already knows its members, so there are no
  // emails to collect — we go straight to the vote.
  async function createShare(vote: VoteType | null, title: string | null) {
    if (sharing) return;
    setShareError("");
    setSharing(true);
    try {
      const url = club ? `/api/clubs/${encodeURIComponent(club.slug)}/trips` : "/api/plan/share";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: { destinations, golfers: playerCount, nights: nightCount, when: tripWhen },
          vote: vote ? { type: vote } : null,
          title: title?.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setShareSetupOpen(false);
        if (club) {
          // Clear the working shortlist — it now lives on the club trip, and
          // leaving it in localStorage would offer to propose it a second time.
          try {
            localStorage.removeItem(storageKey(club));
          } catch {}
          window.location.href = `/plan/shared/${data.id}`;
          return;
        }
        setShareInfo({ id: data.id, url: data.url, voteType: vote });
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
    // While the intake preset is pristine, the chips aren't filtering yet — scope
    // the Caddie to the server result set the user is actually looking at.
    const poolSlugs = intakePreset
      ? caddie.currentTrips.map((t) => t.slug)
      : hasAnyFilter
        ? applyFilters(trips, filterState).map((t) => t.slug)
        : null;
    caddie.sendQuery(caddie.input, poolSlugs);
  }

  // ── Intake gate handlers ──────────────────────────────────────────────────

  function markIntakeDone() {
    try {
      localStorage.setItem(INTAKE_DONE_KEY, "1");
    } catch {
      /* ignore storage write failures */
    }
  }

  // Submit the questionnaire: the server maps answers → runFilter → slugs, and
  // we narrow the grid to them (server order preserved). On any failure we still
  // let the user into the page against the full catalog rather than trapping
  // them at the gate. "View recommendations" with nothing chosen is just
  // browse-all — skip the round-trip and the misleading "matched" banner.
  async function submitIntake(answers: IntakeAnswers) {
    const empty =
      !answers.budget && !answers.length && !answers.ambition &&
      !answers.seasons?.length && !answers.regions?.length && !answers.vibes?.length;
    if (empty) {
      skipIntake();
      return;
    }
    setIntakeSubmitting(true);
    try {
      const res = await fetch("/api/plan/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.slugs)) {
        caddie.showPicks(data.slugs, "intake");
        setFilterState(filterStateFromAnswers(answers)); // mirror answers onto the chips
        setIntakePreset(true); // …but keep them a preview over the server result
      }
    } catch {
      /* fall through to browse-all */
    } finally {
      markIntakeDone();
      setDoneFlag(true);
      setIntakeSubmitting(false);
      finishIntake(); // drop ?page= → results (Back returns to the last question)
    }
  }

  function skipIntake() {
    // Clean browse-all from any state (first visit, or reopening then finishing
    // with no preferences) — clear any preset chips left from an earlier pass.
    setIntakePreset(false);
    setFilterState(EMPTY_FILTERS);
    caddie.resetToAll();
    markIntakeDone();
    setDoneFlag(true);
    finishIntake();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // Gate: hold the page behind the step-1 intake until it's answered or skipped.
  // "pending" is the pre-mount state (avoids a hydration mismatch) — render a
  // neutral placeholder for the one tick before the mount effect resolves it.
  if (intakeState !== "done") {
    const step = wizardStep ?? 0;
    return (
      <div className={styles.planPage}>
        {intakeState === "wizard" ? (
          <IntakeWizard
            step={step}
            onNext={() => goToPage(step + 2)} // step is 0-based; page is 1-based
            onBack={() => router.back()}
            onSubmit={submitIntake}
            submitting={intakeSubmitting}
          />
        ) : (
          <div className={styles.intakeLoading} aria-hidden="true" />
        )}
      </div>
    );
  }

  return (
    <div className={styles.planPage}>
      <div className={styles.planLayout}>

        {/* ── MAIN: Browse canvas ────────────────────────────────── */}
        <div className={styles.planMain}>
          <div className={styles.browsePanel}>

            {/* Filter toolbar */}
            <div className={styles.browseToolbar}>
              <div className={styles.browseFilters}>
                <div className={styles.searchBox}>
                  <span className={styles.searchIcon} aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    className={styles.searchInput}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search trips or courses…"
                    aria-label="Search trips or courses"
                  />
                </div>
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
                {(hasAnyFilter || caddie.isCaddiePicks || searchQuery.trim()) && (
                  <button className={styles.filterClearBtn} onClick={resetAll}>Reset</button>
                )}
              </div>

              <div className={styles.browseToolbarRight}>
                <span className={styles.browseCount}>
                  {gridTrips.length} {gridTrips.length === 1 ? "trip" : "trips"}
                </span>
                <button
                  data-filter-trigger
                  className={styles.sortIconBtn}
                  onClick={(e) => openFilterMenu("sort", e, true)}
                  title={`Sort: ${SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? ""}`}
                  aria-label={`Sort: ${SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? ""}`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2.5 4.5h9M2.5 8h6M2.5 11.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {caddie.isCaddiePicks && (
              <div className={styles.picksBanner}>
                {caddie.picksSource === "intake"
                  ? "Showing trips matched to your preferences."
                  : "Showing the Caddie's picks for your request."}
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
          onShare={startShare} sharing={sharing} shareError={shareError}
          club={club}
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
              onClick={() => setTop100(n)}
              label={`${n}+`}
            />
          ))}
          {portalMenu.id === "sort" && SORT_OPTIONS.map((o) => (
            <MenuItem
              key={o.key}
              active={sortKey === o.key}
              onClick={() => { setSortKey(o.key); setPortalMenu(null); }}
              label={o.label}
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
      {planPopupOpen && planPopupTrip && (
        <PlanStartModal
          trip={planPopupTrip}
          onStart={applyPlanPopup}
          onAddMore={applyPlanPopup}
          onClose={() => setPlanPopupOpen(false)}
        />
      )}

      {/* ── Share setup: choose how the group decides ──────────── */}
      {shareSetupOpen && (
        <ShareSetupModal
          destinationCount={destinations.length}
          sharing={sharing}
          error={shareError}
          club={club}
          onChoose={createShare}
          onClose={() => { setShareSetupOpen(false); setShareError(""); }}
        />
      )}

      {/* ── Share-with-group modal ─────────────────────────────── */}
      {shareInfo && (
        <ShareModal
          shareId={shareInfo.id}
          shareUrl={shareInfo.url}
          destinationCount={destinations.length}
          voteType={shareInfo.voteType}
          onClose={() => setShareInfo(null)}
        />
      )}

    </div>
  );
}

// ── Share setup: how should the group decide? ───────────────────────────────────

function ShareSetupModal({
  destinationCount, sharing, error, club, onChoose, onClose,
}: {
  destinationCount: number;
  sharing: boolean;
  error: string;
  club: { slug: string; name: string } | null;
  onChoose: (vote: VoteType | null, title: string | null) => void;
  onClose: () => void;
}) {
  // null = just share (read-only, no vote); otherwise a vote format.
  const [choice, setChoice] = useState<VoteType | null>("approval");
  // Optional trip name the captain gives the proposal. Only surfaced (and only
  // stored) for a club trip, whose card headlines this instead of "N trips on
  // the table".
  const [name, setName] = useState("");

  useModalDismiss(onClose);

  // "Just share it" is omitted for a club: proposing a trip to a club IS asking
  // it to decide, and a read-only club trip would sit in VOTING with no way out.
  const options: { key: VoteType | null; label: string; blurb: string }[] = [
    ...VOTE_TYPES.map((v) => ({ key: v.key as VoteType | null, label: v.label, blurb: v.blurb })),
    ...(club
      ? []
      : [{ key: null, label: "Just share it", blurb: "Send the shortlist read-only — no voting, anyone with the link can view." }]),
  ];

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalCard} ${styles.shareModalCard}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.planModalHead}>
          <h2 className={styles.planModalTitle}>
            {club ? `How should ${club.name} decide?` : "How should the group decide?"}
          </h2>
          <p className={styles.planModalSub}>
            {club
              ? `You've shortlisted ${destinationCount} trips. Pick how the club picks the winner — every active member gets a vote, and nobody needs an invite.`
              : `You've shortlisted ${destinationCount} trips. Pick how your group picks the winner — voters sign in, and only the people you invite count.`}
          </p>
        </div>

        {club && (
          <div className={styles.tripNameField}>
            <label className={styles.shareLabel} htmlFor="club-trip-name">
              Name this trip <span className={styles.optionalBadge}>Optional</span>
            </label>
            <input
              id="club-trip-name"
              className={styles.tripNameInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fall Bandon Run, Guys' Trip 2026…"
              maxLength={120}
            />
          </div>
        )}

        <div className={styles.voteOptList}>
          {options.map((o) => {
            const active = choice === o.key;
            return (
              <button
                key={o.key ?? "none"}
                className={`${styles.voteOpt} ${active ? styles.voteOptActive : ""}`}
                onClick={() => setChoice(o.key)}
                aria-pressed={active}
              >
                <span className={styles.voteOptRadio} aria-hidden="true">{active ? "●" : "○"}</span>
                <span className={styles.voteOptText}>
                  <span className={styles.voteOptLabel}>{o.label}</span>
                  <span className={styles.voteOptBlurb}>{o.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className={styles.shareErr}>{error}</p>}

        <div className={styles.planModalActions}>
          <button className={styles.planModalPrimary} onClick={() => onChoose(choice, club ? name : null)} disabled={sharing}>
            {sharing ? "Saving…" : "Continue"}
          </button>
          <button className={styles.planModalSecondary} onClick={onClose} disabled={sharing}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Share-with-group modal ──────────────────────────────────────────────────────

function ShareModal({
  shareId, shareUrl, destinationCount, voteType, onClose,
}: {
  shareId: string;
  shareUrl: string;
  destinationCount: number;
  voteType: VoteType | null;
  onClose: () => void;
}) {
  const voteLabel = voteType ? VOTE_TYPES.find((v) => v.key === voteType)?.label : null;
  const [emails, setEmails] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentCount, setSentCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useModalDismiss(onClose);

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
          <h2 className={styles.planModalTitle}>
            {voteLabel ? "Invite your group to vote" : "Share with your group"}
          </h2>
          <p className={styles.planModalSub}>
            {voteLabel
              ? `Everyone you email can sign in and vote (${voteLabel}). Only the people you invite count toward the result.`
              : "Your trip is saved. Send it to your buddies, or copy the link — no account needed to view."}
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
  trip, onStart, onAddMore, onClose,
}: {
  trip: TripOption;
  onStart: () => void;
  onAddMore: () => void;
  onClose: () => void;
}) {
  useModalDismiss(onClose);
  const meta = [trip.region, dollars(trip.costTier)].filter(Boolean).join(" · ");
  const duration = formatDuration(trip.durationMinDays, trip.durationMaxDays);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalCard} ${styles.planModalCard}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.planSplit}>
          {/* ── Left: plan this single trip ── */}
          <section className={styles.planSplitSide}>
            <div className={styles.planModalHead}>
              <h2 className={styles.planModalTitle}>Plan This Trip</h2>
              <p className={styles.planModalSub}>Lock in this destination and start building your itinerary, tee times, lodging, and the rest.</p>
            </div>

            <div className={styles.planPickWrap}>
              <div className={styles.planPickCard}>
                <img src={`/images/trips/${trip.slug}.jpg`} alt="" aria-hidden="true" className={styles.planPickImg} />
                <div className={styles.planPickBody}>
                  <span className={styles.planPickName}>{trip.name}</span>
                  {meta && <span className={styles.planPickMeta}>{meta}</span>}
                  <div className={styles.planPickStats}>
                    {trip.overallRating != null && (
                      <span className={styles.chatTripRating}>{trip.overallRating.toFixed(2)}</span>
                    )}
                    {duration && <span className={styles.planPickStat}>{duration}</span>}
                    {trip.top100Count ? (
                      <span className={styles.planPickStat}>{trip.top100Count} Top 100</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.planModalActions}>
              <button className={styles.planModalPrimary} onClick={onStart}>Start Planning</button>
            </div>
          </section>

          {/* ── Right: add more trips and vote as a group ── */}
          <section className={`${styles.planSplitSide} ${styles.planSplitSideAlt}`}>
            <div className={styles.planModalHead}>
              <h2 className={styles.planModalTitle}>Group Vote</h2>
              <p className={styles.planModalSub}>Shortlist a few more destinations, then share with your group so everyone can vote on where to go.</p>
            </div>

            <div className={styles.planStack}>
              {/* The trip just added — shown small, then ghost slots for more. */}
              <div className={styles.planMiniCard}>
                <img src={`/images/trips/${trip.slug}.jpg`} alt="" aria-hidden="true" className={styles.planMiniImg} />
                <span className={styles.planMiniName}>{trip.name}</span>
              </div>
              {[0, 1].map((i) => (
                <div key={i} className={styles.planGhostCard} aria-hidden="true">
                  <span className={styles.planGhostThumb}>+</span>
                  <span className={styles.planGhostLine} />
                </div>
              ))}
            </div>

            <div className={styles.planModalActions}>
              <button className={styles.planModalPrimary} onClick={onAddMore}>Add More Trips</button>
            </div>
          </section>
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
  club = null,
}: {
  playerCount: number; setPlayerCount: React.Dispatch<React.SetStateAction<number>>;
  nightCount: number; setNightCount: React.Dispatch<React.SetStateAction<number>>;
  tripWhen: TripWhen; setTripWhen: React.Dispatch<React.SetStateAction<TripWhen>>;
  destinations: Destination[]; setDestinations: React.Dispatch<React.SetStateAction<Destination[]>>;
  canShare: boolean;
  onShare?: () => void;
  sharing?: boolean;
  shareError?: string;
  club?: { slug: string; name: string } | null;
}) {
  return (
    <aside className={styles.tripRail}>
      <div className={styles.railHead}>
        <span className={styles.railTitle}>{club ? `Propose to ${club.name}` : "My Trip"}</span>
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
          <WhenPicker value={tripWhen} onChange={setTripWhen} />
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
          {sharing ? "Saving…" : club ? "Propose to the club" : "Share with group"}
        </button>
        {!club && (
          <button className={styles.ghostBtn} disabled={destinations.length !== 1}>Plan this trip →</button>
        )}
        {!canShare ? (
          <p className={styles.shareHint}>
            {club
              ? "Add at least 2 destinations for the club to choose between."
              : "Add at least 1 destination to continue."}
          </p>
        ) : shareError ? (
          <p className={styles.shareErr}>{shareError}</p>
        ) : null}
      </div>
    </aside>
  );
}
