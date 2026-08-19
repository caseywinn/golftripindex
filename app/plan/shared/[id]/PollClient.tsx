"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { VOTE_TYPES } from "@/lib/planVote";
import { formatTripWhen, type WhenLike } from "@/lib/planWhen";
import {
  roundMatchups,
  isVotable,
  roundLabel,
  champion,
  projectedWinner,
  type Bracket,
  type Matchup,
} from "@/lib/planBracket";
import type { PollView } from "@/lib/planPoll";
import { useModalDismiss } from "../../planShared";
import styles from "@/styles/sharedTrip.module.css";

function dollars(n: number | null | undefined): string {
  if (!n || n < 1) return "";
  return "$".repeat(Math.min(5, Math.max(1, n)));
}

// Pre-login picks are staged in localStorage so they survive the sign-in
// round-trip; cleared once a ballot saves successfully.
function loadStaged<T>(key: string): T | null {
  try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
}
function saveStaged(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode / quota */ }
}
function clearStaged(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export default function PollClient({ initial }: { initial: PollView }) {
  const [view, setView] = useState<PollView>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The advance-round confirmation modal (captain only).
  const [advanceOpen, setAdvanceOpen] = useState(false);

  const vote = view.vote!; // PollClient is only rendered when voting is on
  const formatLabel = VOTE_TYPES.find((v) => v.key === vote.type)?.label ?? "Vote";
  const isOpen = vote.status === "open";
  // A named trip headlines its own name; an unnamed one still has to ask the
  // question. The window ("Fall", "March 2026", or a date range) rides along
  // either way when the proposer set one — it is part of what people vote on.
  // nights is passed so a dates-mode window shows its end, matching how the
  // read-only share renders it in page.tsx.
  const tripTitle = view.club?.tripTitle ?? null;
  const whenLabel = formatTripWhen(view.when as WhenLike | null, view.nights ?? 0);
  const loginUrl = `/login?callbackUrl=${encodeURIComponent(`/plan/shared/${view.id}`)}`;

  // Poll for live "who voted" updates while the vote is open.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/plan/shared/${view.id}/poll`, { cache: "no-store" });
      if (res.ok) setView(await res.json());
    } catch { /* keep last view */ }
  }, [view.id]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(refresh, 12_000);
    return () => clearInterval(t);
  }, [isOpen, refresh]);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/plan/shared/${view.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (res.ok) setView(data);
      else setError(data.error || "Something went wrong.");
      return res.ok;
    } catch {
      setError("Network error. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const { loggedIn, onRoster, isCaptain } = view.viewer;

  // Anyone can browse the trips and stage their picks while the vote is open;
  // signing in is only required to *save* a ballot.
  async function submitBallot(ballot: unknown): Promise<boolean> {
    if (!loggedIn) {
      // Staged picks are already in localStorage; come back here after login.
      window.location.href = loginUrl;
      return false;
    }
    return post("vote", { ballot });
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>
            {view.club
              ? `${view.club.name}${view.sharedBy ? ` · proposed by ${view.sharedBy}` : ""}`
              : view.sharedBy
                ? `${view.sharedBy} wants your vote`
                : "Vote on the trip"}
          </p>
          <h1 className={styles.title}>
            {tripTitle ?? (view.club ? "Where should the club go?" : "Where should the group go?")}
          </h1>
          <div className={styles.meta}>
            {whenLabel && <span className={styles.metaPill}>{whenLabel}</span>}
            <span className={styles.metaPill}>{formatLabel}</span>
            <span className={`${styles.statusPill} ${isOpen ? styles.statusOpen : styles.statusClosed}`}>
              {isOpen ? "Voting open" : "Voting closed"}
            </span>
            {view.roster.size > 0 && (
              <span className={styles.metaPill}>{view.roster.voted} of {view.roster.size} voted</span>
            )}
          </div>
        </div>

        {/* Open to everyone — sign-in only happens when you save. */}
        {!loggedIn && isOpen && (
          <div className={styles.notice}>
            <p className={styles.noticeText}>
              Look through the trips and make your picks. You&apos;ll sign in to save them — only invited people count toward the result.
            </p>
          </div>
        )}

        {/* Logged in but not invited. A club poll seats every active member at
            creation, so landing here means they aren't in the club (or joined
            after the vote started) — "ask to be added" would be wrong advice. */}
        {loggedIn && !onRoster && (
          <div className={styles.notice}>
            <p className={styles.noticeText}>
              {view.club ? (
                <>
                  You&apos;re signed in, but you weren&apos;t on {view.club.name}&apos;s roster when
                  this vote started, so you can&apos;t vote in it.
                </>
              ) : (
                <>
                  You&apos;re signed in, but not on the invite list for this vote. Ask{" "}
                  {view.sharedBy || "the captain"} to add your email.
                </>
              )}
            </p>
          </div>
        )}

        {/* Bracket: full tree (votes inline on the current round). One-shot:
            ballot while open, results once closed. */}
        {vote.type === "bracket" ? (
          <BracketBoard
            view={view}
            canVote={isOpen}
            loggedIn={loggedIn}
            busy={busy}
            onSubmit={(picks) => submitBallot({ picks })}
          />
        ) : (
          <>
            {isOpen && (
              <Ballot view={view} vote={vote} busy={busy} loggedIn={loggedIn} onSubmit={(ballot) => submitBallot(ballot)} />
            )}
            {!isOpen && <Results view={view} />}
          </>
        )}

        {/* Who's voted */}
        {view.voters.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardHead}>Who&apos;s voted</div>
            <ul className={styles.voterList}>
              {view.voters.map((v, i) => (
                <li key={i} className={styles.voterRow}>
                  <span className={`${styles.voterMark} ${v.voted ? styles.voterMarkOn : ""}`}>{v.voted ? "✓" : "•"}</span>
                  <span className={styles.voterName}>
                    {v.label}{v.isYou ? " (you)" : ""}{v.isCaptain ? " · captain" : ""}
                  </span>
                  <span className={styles.voterState}>{v.voted ? "Voted" : "Waiting"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className={styles.errorText}>{error}</p>}

        {/* Captain controls */}
        {isCaptain && isOpen && (() => {
          const bracket = vote.type === "bracket" ? (vote.bracket as Bracket | undefined) : undefined;
          const isFinalRound = !!bracket && vote.currentRound >= bracket.rounds;
          return (
            <div className={styles.captainBar}>
              <button className={styles.closeBtn} disabled={busy} onClick={() => setAdvanceOpen(true)}>
                {busy
                  ? "Working…"
                  : !bracket
                    ? "Review & close the vote"
                    : isFinalRound
                      ? "Crown the champion"
                      : "Advance round now"}
              </button>
              <p className={styles.captainHint}>
                {bracket
                  ? "Nothing resolves until you say so. You'll see every matchup and its tally, and can call any of them by hand, before anyone is knocked out."
                  : "Nothing closes until you say so. You'll see the standings, and can call the winner yourself, before anyone else sees a result."}
              </p>
              {advanceOpen && (bracket ? (
                <AdvanceModal
                  view={view}
                  bracket={bracket}
                  isFinal={isFinalRound}
                  busy={busy}
                  onClose={() => setAdvanceOpen(false)}
                  onConfirm={async (overrides) => {
                    const ok = await post("close", { overrides });
                    if (ok) setAdvanceOpen(false);
                  }}
                />
              ) : (
                <ReviewModal
                  view={view}
                  busy={busy}
                  onClose={() => setAdvanceOpen(false)}
                  onConfirm={async (winner) => {
                    const ok = await post("close", { winner });
                    if (ok) setAdvanceOpen(false);
                  }}
                />
              ))}
            </div>
          );
        })()}

        <div className={styles.footer}>
          {view.club ? (
            <Link href={`/clubs/${view.club.slug}`} className={styles.cta}>
              ← Back to {view.club.name}
            </Link>
          ) : (
            <Link href="/plan" className={styles.cta}>Plan your own golf trip →</Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ballot: per-type input ──────────────────────────────────────────────────────

function Ballot({
  view, vote, busy, loggedIn, onSubmit,
}: {
  view: PollView;
  vote: NonNullable<PollView["vote"]>;
  busy: boolean;
  loggedIn: boolean;
  onSubmit: (ballot: unknown) => Promise<boolean>;
}) {
  const dests = view.destinations;
  const myBallot = view.myBallot as { approve?: string[]; order?: string[] } | null;
  const hasVoted = !!myBallot;
  const stageKey = `gti-poll-${view.id}-${vote.type}`;

  // approval — set of approved slugs
  const [approved, setApproved] = useState<Set<string>>(
    () => new Set(Array.isArray(myBallot?.approve) ? myBallot!.approve : [])
  );
  // ranked — ordered slug list, seeded from prior ballot or destination order
  const [order, setOrder] = useState<string[]>(
    () => {
      const prior = Array.isArray(myBallot?.order) ? myBallot!.order.filter((s) => dests.some((d) => d.slug === s)) : [];
      const missing = dests.map((d) => d.slug).filter((s) => !prior.includes(s));
      return [...prior, ...missing];
    }
  );

  // Restore pre-login staged picks (only when nothing's been saved yet), then
  // persist on change. Mount-effect restore avoids an SSR/hydration mismatch.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hasVoted) {
      const staged = loadStaged<{ approve?: string[]; order?: string[] }>(stageKey);
      if (vote.type === "approval" && Array.isArray(staged?.approve)) {
        setApproved(new Set(staged!.approve!.filter((s) => dests.some((d) => d.slug === s))));
      }
      if (vote.type === "ranked" && Array.isArray(staged?.order)) {
        const prior = staged!.order!.filter((s) => dests.some((d) => d.slug === s));
        const missing = dests.map((d) => d.slug).filter((s) => !prior.includes(s));
        setOrder([...prior, ...missing]);
      }
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    saveStaged(stageKey, vote.type === "approval" ? { approve: [...approved] } : { order });
  }, [approved, order, stageKey, vote.type]);

  async function submit() {
    const ok = await onSubmit(vote.type === "approval" ? { approve: [...approved] } : { order });
    if (ok) clearStaged(stageKey);
  }

  function move(i: number, dir: -1 | 1) {
    setOrder((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const bySlug = (s: string) => dests.find((d) => d.slug === s)!;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        {vote.type === "approval" ? "Pick every trip you'd be happy with" : "Drag the trips into your order — best at the top"}
      </div>

      {vote.type === "approval" &&
        dests.map((d) => {
          const on = approved.has(d.slug);
          return (
            <button
              key={d.slug}
              className={`${styles.ballotItem} ${on ? styles.ballotItemOn : ""}`}
              onClick={() =>
                setApproved((prev) => {
                  const next = new Set(prev);
                  if (next.has(d.slug)) next.delete(d.slug); else next.add(d.slug);
                  return next;
                })
              }
            >
              <span className={`${styles.checkbox} ${on ? styles.checkboxOn : ""}`}>{on ? "✓" : ""}</span>
              <img src={`/images/trips/${d.slug}.jpg`} alt="" aria-hidden="true" className={styles.ballotImg} />
              <span className={styles.ballotInfo}>
                <span className={styles.ballotName}>{d.name}</span>
                <span className={styles.ballotMeta}>
                  {[dollars(d.costTier), d.overallRating != null ? d.overallRating.toFixed(2) : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          );
        })}

      {vote.type === "ranked" &&
        order.map((slug, i) => {
          const d = bySlug(slug);
          return (
            <div key={slug} className={styles.ballotItem}>
              <span className={styles.rankNum}>{i + 1}</span>
              <img src={`/images/trips/${slug}.jpg`} alt="" aria-hidden="true" className={styles.ballotImg} />
              <span className={styles.ballotInfo}>
                <span className={styles.ballotName}>{d.name}</span>
                <span className={styles.ballotMeta}>
                  {[dollars(d.costTier), d.overallRating != null ? d.overallRating.toFixed(2) : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className={styles.rankBtns}>
                <button className={styles.rankBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">▲</button>
                <button className={styles.rankBtn} disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">▼</button>
              </span>
            </div>
          );
        })}

      <div className={styles.ballotActions}>
        <button
          className={styles.submitBtn}
          disabled={busy || (vote.type === "approval" && approved.size === 0)}
          onClick={submit}
        >
          {busy ? "Saving…" : !loggedIn ? "Sign in to save your vote" : hasVoted ? "Update my vote" : "Submit my vote"}
        </button>
        {hasVoted
          ? <span className={styles.ballotHint}>Your vote is in — you can change it until voting closes.</span>
          : !loggedIn && <span className={styles.ballotHint}>Your picks are saved on this device until you sign in.</span>}
      </div>
    </div>
  );
}

// ── Bracket board ────────────────────────────────────────────────────────────────

function BracketBoard({
  view, canVote, loggedIn, busy, onSubmit,
}: {
  view: PollView;
  canVote: boolean;
  loggedIn: boolean;
  busy: boolean;
  onSubmit: (picks: Record<string, string>) => Promise<boolean>;
}) {
  const vote = view.vote!;
  const bracket = vote.bracket as Bracket | undefined;
  const name = (slug: string | null) => (slug ? view.destinations.find((d) => d.slug === slug)?.name ?? slug : null);

  const myPicks = (view.myBallot as { picks?: Record<string, string> } | null)?.picks ?? {};
  const hasVoted = Object.keys(myPicks).length > 0;
  const stageKey = `gti-poll-${view.id}-bracket-r${vote.currentRound}`;
  const [picks, setPicks] = useState<Record<string, string>>(() => ({ ...myPicks }));
  // The matchup whose head-to-head compare modal is open.
  const [compareFor, setCompareFor] = useState<Matchup | null>(null);
  // The trip whose preview modal is open.
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  // Restore pre-login staged picks for this round (only when nothing saved yet),
  // then persist on change. Mount-effect restore avoids hydration mismatch.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hasVoted) {
      const staged = loadStaged<Record<string, string>>(stageKey);
      if (staged && typeof staged === "object") setPicks(staged);
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    saveStaged(stageKey, picks);
  }, [picks, stageKey]);

  // On a phone the board is a one-round-per-page swipe carousel, so it has to
  // open parked on the live round rather than on round 1. Nothing overflows on
  // desktop, where the scroll is a no-op.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const currentColRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const col = currentColRef.current;
    if (!scroller || !col) return;
    const behavior = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = "auto";
    scroller.scrollLeft += col.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    scroller.style.scrollBehavior = behavior;
  }, [vote.currentRound]);

  async function submit() {
    const ok = await onSubmit(picks);
    if (ok) clearStaged(stageKey);
  }

  if (!bracket) {
    return (
      <div className={styles.notice}>
        <p className={styles.noticeText}>The bracket is being set up — check back shortly.</p>
      </div>
    );
  }

  const destOf = (slug: string | null) => (slug ? view.destinations.find((d) => d.slug === slug) ?? null : null);
  // The server sends captainTally: null to everyone but the captain, so counts
  // stay null for the crowd and the running tally never renders for them.
  const tally = view.captainTally;
  const countsFor = (m: Matchup) =>
    tally && tally.round === m.round ? tally.counts[m.id] ?? { a: 0, b: 0 } : null;
  const champ = champion(bracket);
  const round = vote.currentRound;
  const votable = canVote ? roundMatchups(bracket, round).filter(isVotable) : [];

  const allPicked = votable.every((m) => picks[m.id]);
  const canPickOpen = !!compareFor && canVote && vote.status === "open" && compareFor.round === round && isVotable(compareFor);

  // Every round is in the markup so a phone can swipe through the whole tree.
  // Desktop shows only the focused window — the previous round (minimized), the
  // current round (wide, rich cards), and a preview of the next — and hides the
  // rest via .bColFar. The champion stands in for "next" on the final round.
  type Col = { key: string; r?: number; champion?: boolean; role: "past" | "prev" | "current" | "next" | "future" };
  const roleFor = (r: number): Col["role"] =>
    r === round ? "current" : r === round - 1 ? "prev" : r === round + 1 ? "next" : r < round ? "past" : "future";
  const columns: Col[] = [];
  for (let r = 1; r <= bracket.rounds; r++) columns.push({ key: `r${r}`, r, role: roleFor(r) });
  columns.push({ key: "champ", champion: true, role: round >= bracket.rounds ? "next" : "future" });

  return (
    <div>
      <div className={styles.bracketScroll}>
        <div className={styles.bracket} ref={scrollerRef}>
          {columns.map((col) => {
            const showIn = col.role === "next" || (col.role === "current" && round > 1);
            const showOut = col.role === "prev" || col.role === "current";

            if (col.champion) {
              return (
                <div
                  key={col.key}
                  className={`${styles.bCol} ${styles.bColChamp} ${col.role === "next" ? "" : styles.bColFar}`}
                >
                  <div className={styles.bColHead}>Champion</div>
                  <div className={styles.bColBody}>
                    <div className={`${styles.bSlot} ${showIn ? styles.bSlotIn : ""} ${styles.bSlotLone}`}>
                      {showIn && <span className={styles.bIn} aria-hidden="true" />}
                      <div className={`${styles.bChamp} ${champ ? styles.bChampWon : ""}`}>
                        <span className={styles.bChampTrophy}>🏆</span>
                        <span className={styles.bChampName}>{champ ? name(champ) : "TBD"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const r = col.r!;
            const matchups = roundMatchups(bracket, r);
            const single = matchups.length === 1;
            const live = r === round && vote.status === "open";
            const widthCls =
              col.role === "current"
                ? styles.bColCurrent
                : col.role === "prev"
                  ? styles.bColPrev
                  : col.role === "next"
                    ? styles.bColNext
                    : styles.bColFar;

            return (
              <div
                key={col.key}
                ref={col.role === "current" ? currentColRef : undefined}
                className={`${styles.bCol} ${widthCls} ${showOut ? styles.bColOut : ""}`}
              >
                <div className={styles.bColHead}>
                  {roundLabel(r, bracket.rounds)}
                  {live && <span className={styles.bLive}>Voting</span>}
                  {r < round && <span className={styles.bColTag}>Done</span>}
                  {r > round && <span className={styles.bColTag}>Up next</span>}
                </div>
                <div className={styles.bColBody}>
                  {matchups.map((m, idx) => (
                    <div
                      key={m.id}
                      className={`${styles.bSlot} ${showIn ? styles.bSlotIn : ""} ${single ? styles.bSlotLone : idx % 2 === 0 ? styles.bSlotTop : styles.bSlotBottom}`}
                    >
                      {showIn && <span className={styles.bIn} aria-hidden="true" />}
                      <BracketMatch
                        m={m}
                        variant={live ? "big" : "compact"}
                        destOf={destOf}
                        name={name}
                        pick={picks[m.id]}
                        votable={live && canVote && isVotable(m)}
                        onPreview={setPreviewSlug}
                        onVote={(slug) => setPicks((p) => ({ ...p, [m.id]: slug }))}
                        onCompare={m.a && m.b ? () => setCompareFor(m) : undefined}
                        counts={live ? countsFor(m) : null}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {/* Phone only — the swipe is the only way to the other rounds there, and
            a gesture with no affordance goes unfound. */}
        <p className={styles.bSwipeHint}>Swipe to see the other rounds</p>
      </div>

      {canVote && votable.length > 0 && (
        <div className={styles.ballotActions}>
          <button className={styles.submitBtn} disabled={busy || !allPicked} onClick={submit}>
            {busy ? "Saving…" : !loggedIn ? "Sign in to save your picks" : hasVoted ? "Update my picks" : "Submit my picks"}
          </button>
          <span className={styles.ballotHint}>
            {hasVoted
              ? "Your picks are in — change them until the round closes."
              : !loggedIn
                ? "Hit Vote on each matchup — your picks are saved on this device until you sign in."
                : "Hit Vote on a trip, or tap a trip to preview it or run a GTI Compare first."}
          </span>
        </div>
      )}

      {previewSlug && (
        <TripPreviewModal slug={previewSlug} name={name(previewSlug) ?? previewSlug} onClose={() => setPreviewSlug(null)} />
      )}

      {compareFor && compareFor.a && compareFor.b && (
        <CompareModal
          a={compareFor.a}
          b={compareFor.b}
          nameA={name(compareFor.a) ?? compareFor.a}
          nameB={name(compareFor.b) ?? compareFor.b}
          canPick={canPickOpen}
          currentPick={picks[compareFor.id]}
          onPick={(slug) => {
            setPicks((p) => ({ ...p, [compareFor.id]: slug }));
            setCompareFor(null);
          }}
          onClose={() => setCompareFor(null)}
        />
      )}
    </div>
  );
}

function BracketMatch({
  m, variant, destOf, name, pick, votable, onPreview, onVote, onCompare, counts,
}: {
  m: Matchup;
  variant: "big" | "compact";
  destOf: (slug: string | null) => { slug: string; overallRating: number | null; costTier: number | null } | null;
  name: (slug: string | null) => string | null;
  pick: string | undefined;
  votable: boolean;
  onPreview: (slug: string) => void;
  onVote: (slug: string) => void;
  onCompare?: () => void;
  /** Captain only: live votes for each side of this matchup. */
  counts?: { a: number; b: number } | null;
}) {
  const big = variant === "big";

  function renderSide(key: "a" | "b") {
    const slug = m[key];
    const isWinner = !!m.winner && m.winner === slug;
    const isLoser = !!m.winner && !!slug && m.winner !== slug;
    const isPicked = votable && pick === slug;
    const d = destOf(slug);
    const votes = counts && slug ? counts[key] : null;

    if (big) {
      const cls = [
        styles.bBigSide,
        !slug ? styles.bBigSideEmpty : "",
        isWinner ? styles.bSideWin : "",
        isLoser ? styles.bSideLoss : "",
        isPicked ? styles.bBigSidePicked : "",
      ].filter(Boolean).join(" ");
      const meta = [dollars(d?.costTier), d?.overallRating != null ? d.overallRating.toFixed(2) : null]
        .filter(Boolean).join(" · ");
      return (
        <div key={key} className={cls}>
          {/* Image + name → trip preview. */}
          <button className={styles.bBigOpen} onClick={() => slug && onPreview(slug)} disabled={!slug}>
            {slug && <img src={`/images/trips/${slug}.jpg`} alt="" aria-hidden="true" className={styles.bBigImg} />}
            <span className={styles.bBigInfo}>
              <span className={styles.bBigName}>{slug ? name(slug) : "—"}</span>
              {meta && <span className={styles.bBigMeta}>{meta}</span>}
            </span>
          </button>
          {/* Direct vote — no modal required. The captain's running tally sits
              under the button; nobody else is sent the numbers. */}
          {slug && (votable || votes != null) && (
            <div className={styles.bVoteCell}>
              {votable && (
                <button
                  className={`${styles.bVoteBtn} ${isPicked ? styles.bVoteBtnOn : ""}`}
                  onClick={() => onVote(slug)}
                  aria-label={isPicked ? `Picked ${name(slug) ?? ""}`.trim() : `Vote for ${name(slug) ?? ""}`.trim()}
                >
                  {/* Both states are stacked in one grid cell, so the picked state —
                      a bare checkmark — keeps the width the word "Vote" sets. */}
                  <span className={styles.bVoteBtnWord}>Vote</span>
                  {isPicked && <span className={styles.bVoteBtnCheck} aria-hidden="true">✓</span>}
                </button>
              )}
              {votes != null && (
                <span className={styles.bVoteTally}>{votes} vote{votes === 1 ? "" : "s"}</span>
              )}
            </div>
          )}
          {isWinner && <span className={styles.bSideMark}>🏆</span>}
        </div>
      );
    }

    const cls = [
      styles.bSide,
      !slug ? styles.bSideEmpty : "",
      isWinner ? styles.bSideWin : "",
      isLoser ? styles.bSideLoss : "",
      isPicked ? styles.bSidePicked : "",
    ].filter(Boolean).join(" ");
    return (
      <div key={key} className={cls}>
        <button className={styles.bSideNameBtn} onClick={() => slug && onPreview(slug)} disabled={!slug}>
          {slug ? name(slug) : "—"}
        </button>
        {isWinner && <span className={styles.bSideMark}>✓</span>}
      </div>
    );
  }

  if (big) {
    return (
      <div className={styles.bMatchBig}>
        {renderSide("a")}
        <span className={styles.bBigVs}>VS</span>
        {renderSide("b")}
        {onCompare && (
          <button className={styles.bCompareBtn} onClick={onCompare}>⚖ GTI Compare</button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.bMatch}>
      {renderSide("a")}
      {renderSide("b")}
    </div>
  );
}

// ── Close-out review, approval + ranked (captain only) ───────────────────────────

/**
 * The standings before anyone else sees them, and the chance to call the winner.
 *
 * A one-shot vote has no matchups, so the captain's override is the winner
 * itself. Calling it doesn't touch the ballots — the standings still read
 * exactly as the group voted them, with the call sitting beside them.
 */
function ReviewModal({
  view, busy, onClose, onConfirm,
}: {
  view: PollView;
  busy: boolean;
  onClose: () => void;
  onConfirm: (winner: string | null) => void;
}) {
  useModalDismiss(onClose);

  const results = view.captainResults;
  const name = (slug: string) => view.destinations.find((d) => d.slug === slug)?.name ?? slug;
  // Only a deviation lives here: picking the trip the vote already gives it
  // clears the call, so "Your call" means the captain overrode something.
  const [called, setCalled] = useState<string | null>(null);

  const rows = results?.rows ?? [];
  const tied = (results?.winners.length ?? 0) > 1;
  // A tie has no single winner to fall back on, so nothing leads until called.
  const byVote = tied ? null : results?.winners[0] ?? null;
  const winner = called ?? byVote;
  const max = rows.length ? Math.max(1, rows[0].score) : 1;
  const unit = results?.type === "ranked" ? "pts" : "votes";

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.advCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.advHead}>
          <div className={styles.advHeadText}>
            <h2 className={styles.advTitle}>Close out the vote</h2>
            <p className={styles.advSub}>
              {view.roster.voted} of {view.roster.size} voted · tap a trip to call it the winner
            </p>
          </div>
          <button className={styles.modalCloseBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={styles.advBody}>
          {rows.length === 0 ? (
            <p className={styles.advNote}>No ballots yet — closing now decides nothing.</p>
          ) : (
            rows.map((r) => {
              const wins = winner === r.slug;
              return (
                <button
                  key={r.slug}
                  className={`${styles.revRow} ${wins ? styles.revRowOn : ""} ${wins && called ? styles.revRowCalled : ""}`}
                  disabled={busy}
                  onClick={() => setCalled(r.slug === byVote || r.slug === called ? null : r.slug)}
                >
                  <span className={styles.revTop}>
                    <span className={styles.revName}>{wins ? "🏆 " : ""}{name(r.slug)}</span>
                    <span className={styles.revScore}>
                      {r.score} {unit}
                      {wins && <span className={styles.revTag}>{called ? "Your call" : "Winner"}</span>}
                    </span>
                  </span>
                  <span className={styles.resultBarTrack}>
                    <span className={styles.resultBar} style={{ width: `${(r.score / max) * 100}%` }} />
                  </span>
                </button>
              );
            })
          )}
          <p className={styles.advNote}>
            {called
              ? `Your call — ${name(called)} takes the trip however the vote landed.`
              : tied
                ? "Tied — call it, or the trip stays unsettled."
                : winner
                  ? `${name(winner)} takes the trip on the vote.`
                  : "Nothing is decided yet."}
          </p>
        </div>

        <div className={styles.advFoot}>
          <button className={styles.advCancel} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={styles.advGo} onClick={() => onConfirm(called)} disabled={busy}>
            {busy ? "Working…" : "Close the vote"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Advance-round confirmation (captain only) ────────────────────────────────────

/**
 * What advancing would do, matchup by matchup, before it happens.
 *
 * The captain sees the tally, the trip each matchup would send through, and can
 * call any of them the other way. Nothing is written until they confirm — the
 * calls ride along with the advance request — so cancelling really does leave
 * the round untouched.
 */
function AdvanceModal({
  view, bracket, isFinal, busy, onClose, onConfirm,
}: {
  view: PollView;
  bracket: Bracket;
  /** The last round: confirming crowns a champion instead of advancing. */
  isFinal: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (overrides: Record<string, string | null>) => void;
}) {
  useModalDismiss(onClose);

  const round = view.vote!.currentRound;
  const tally = view.captainTally;
  const name = (slug: string | null) => (slug ? view.destinations.find((d) => d.slug === slug)?.name ?? slug : null);
  const matchups = roundMatchups(bracket, round).filter((m) => m.a || m.b);

  // Seeded from any calls the captain already recorded. Only genuine deviations
  // live here: picking the side the vote already sends through clears the call
  // rather than pinning it, so "Your call" means what it says.
  const [calls, setCalls] = useState<Record<string, string>>(() =>
    tally && tally.round === round ? { ...tally.overrides } : {}
  );

  const countsOf = (m: Matchup) =>
    (tally && tally.round === round ? tally.counts[m.id] : null) ?? { a: 0, b: 0 };
  // projectedWinner is the same function the server resolves the round with, so
  // this preview cannot disagree with what advancing actually does.
  const winnerOf = (m: Matchup) => m.winner ?? projectedWinner(bracket, m, countsOf(m), calls[m.id]);

  function toggle(m: Matchup, slug: string) {
    const byVote = projectedWinner(bracket, m, countsOf(m));
    setCalls((c) => {
      const next = { ...c };
      if (slug === byVote) delete next[m.id];
      else next[m.id] = slug;
      return next;
    });
  }

  // Every undecided matchup is sent, including the ones with no call — that is
  // how clearing a call made earlier reaches the server, as an explicit null.
  const payload: Record<string, string | null> = {};
  for (const m of matchups) if (m.a && m.b && !m.winner) payload[m.id] = calls[m.id] ?? null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.advCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.advHead}>
          <div className={styles.advHeadText}>
            <h2 className={styles.advTitle}>
              {isFinal ? "Crown the champion" : `Advance the ${roundLabel(round, bracket.rounds)}`}
            </h2>
            <p className={styles.advSub}>
              {view.roster.voted} of {view.roster.size} voted · tap a trip to send it through instead
            </p>
          </div>
          <button className={styles.modalCloseBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={styles.advBody}>
          {matchups.map((m) => {
            const counts = countsOf(m);
            const win = winnerOf(m);
            const decided = !m.a || !m.b || !!m.winner;
            const called = !!calls[m.id];
            const tied = counts.a === counts.b;

            const side = (key: "a" | "b") => {
              const slug = m[key];
              if (!slug) return <span className={styles.advSideEmpty}>Bye</span>;
              const n = key === "a" ? counts.a : counts.b;
              const through = win === slug;
              return (
                <button
                  className={`${styles.advSide} ${through ? styles.advSideOn : ""}`}
                  disabled={decided || busy}
                  onClick={() => toggle(m, slug)}
                >
                  <span className={styles.advSideName}>{name(slug)}</span>
                  <span className={styles.advSideVotes}>{n} vote{n === 1 ? "" : "s"}</span>
                  {through && (
                    <span className={styles.advSideTag}>{called ? "Your call" : "Advances"}</span>
                  )}
                </button>
              );
            };

            return (
              <div key={m.id} className={`${styles.advMatch} ${called ? styles.advMatchCalled : ""}`}>
                <div className={styles.advSides}>
                  {side("a")}
                  <span className={styles.advVs}>vs</span>
                  {side("b")}
                </div>
                <p className={styles.advNote}>
                  {decided
                    ? `${name(win)} is already through.`
                    : called
                      ? isFinal
                        ? `Your call — ${name(win)} takes the trip however the vote lands.`
                        : `Your call — ${name(win)} advances however the vote lands.`
                      : tied
                        ? isFinal
                          ? // Seed would crown one, but a coin-flip champion never
                            // locks the trip — only the captain's call settles it.
                            `Tied — call it, or the trip stays unsettled.`
                          : `Tied — ${name(win)} advances on seed unless you call it.`
                        : isFinal
                          ? `${name(win)} takes the trip on the vote.`
                          : `${name(win)} advances on the vote.`}
                </p>
              </div>
            );
          })}
        </div>

        <div className={styles.advFoot}>
          <button className={styles.advCancel} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={styles.advGo} onClick={() => onConfirm(payload)} disabled={busy}>
            {busy ? "Working…" : isFinal ? "Crown champion" : "Advance round"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Head-to-head compare modal ───────────────────────────────────────────────────

const COMPARE_PHASES = [
  "Preparing the matchup…",
  "Comparing the golf…",
  "Weighing lodging, food, and the hang…",
  "Thinking through travel and value…",
  "Writing the verdict…",
];

function CompareModal({
  a, b, nameA, nameB, canPick, currentPick, onPick, onClose,
}: {
  a: string;
  b: string;
  nameA: string;
  nameB: string;
  canPick: boolean;
  currentPick: string | undefined;
  onPick: (slug: string) => void;
  onClose: () => void;
}) {
  const [article, setArticle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState(0);

  useModalDismiss(onClose);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setPhase((i) => (i + 1) % COMPARE_PHASES.length), 2500);
    return () => clearInterval(t);
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setArticle(null);
    (async () => {
      try {
        const res = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ A: a, B: b }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data?.output?.article_markdown) setArticle(data.output.article_markdown as string);
        else setError(data?.error || "Couldn't load this comparison. Try again.");
      } catch {
        if (!cancelled) setError("Couldn't load this comparison. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [a, b]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.compareModalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.compareModalHead}>
          <div className={styles.compareModalVs}>
            <span className={styles.compareVsName}>{nameA}</span>
            <span className={styles.compareVsDot}>vs</span>
            <span className={styles.compareVsName}>{nameB}</span>
          </div>
          <button className={styles.modalCloseBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {canPick && (
          <div className={styles.comparePickRow}>
            <button
              className={`${styles.comparePickBtn} ${currentPick === a ? styles.comparePickBtnOn : ""}`}
              onClick={() => onPick(a)}
            >
              {currentPick === a ? "✓ " : ""}Pick {nameA}
            </button>
            <button
              className={`${styles.comparePickBtn} ${currentPick === b ? styles.comparePickBtnOn : ""}`}
              onClick={() => onPick(b)}
            >
              {currentPick === b ? "✓ " : ""}Pick {nameB}
            </button>
          </div>
        )}

        <div className={styles.compareModalBody}>
          {loading && (
            <div className={styles.compareLoading}>
              <div className={styles.compareSpinner} />
              <p className={styles.compareLoadingText}>{COMPARE_PHASES[phase]}</p>
              <p className={styles.compareLoadingSub}>A fresh head-to-head can take 10–20 seconds.</p>
            </div>
          )}
          {error && <p className={styles.shareErr}>{error}</p>}
          {article && (
            <div className={styles.compareArticle}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Trip preview modal (trip + its courses) ──────────────────────────────────────

type PreviewCourse = { slug: string; name: string; architect: string | null; ranking: number | null; tier: string };
type TripPreview = {
  slug: string;
  name: string;
  region: string | null;
  costTier: number | null;
  durationMinDays: number | null;
  durationMaxDays: number | null;
  overallRating: number | null;
  golfRating: number | null;
  lodgingRating: number | null;
  foodRating: number | null;
  valueRating: number | null;
  pullQuote: string | null;
  courses: PreviewCourse[];
};

function TripPreviewModal({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<TripPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useModalDismiss(onClose);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    (async () => {
      try {
        const res = await fetch(`/api/trips/preview/${slug}`, { cache: "force-cache" });
        const json = await res.json();
        if (cancelled) return;
        if (res.ok && json?.slug) setData(json as TripPreview);
        else setError(json?.error || "Couldn't load this trip.");
      } catch {
        if (!cancelled) setError("Couldn't load this trip.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Sub-ratings round to a whole number; Overall keeps two decimals and stands
  // out at the end.
  const subRatings = data
    ? ([
        ["Golf", data.golfRating],
        ["Lodging", data.lodgingRating],
        ["Food", data.foodRating],
        ["Value", data.valueRating],
      ] as const).filter(([, v]) => v != null)
    : [];

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.previewModalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHero}>
          <img src={`/images/trips/${slug}.jpg`} alt="" aria-hidden="true" className={styles.previewHeroImg} />
          <button className={styles.previewClose} onClick={onClose} aria-label="Close">×</button>
          <div className={styles.previewHeroText}>
            <h2 className={styles.previewTitle}>{data?.name ?? name}</h2>
            {data && (
              <p className={styles.previewSub}>
                {[data.region, dollars(data.costTier)].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className={styles.previewBody}>
          {loading && (
            <div className={styles.compareLoading}>
              <div className={styles.compareSpinner} />
              <p className={styles.compareLoadingText}>Loading the trip…</p>
            </div>
          )}
          {error && <p className={styles.shareErr}>{error}</p>}
          {data && (
            <>
              {data.pullQuote && <p className={styles.previewQuote}>{data.pullQuote}</p>}

              {(subRatings.length > 0 || data.overallRating != null) && (
                <div className={styles.previewRatings}>
                  {subRatings.map(([label, v]) => (
                    <div key={label} className={styles.previewRating}>
                      <span className={styles.previewRatingNum}>{Math.round(v as number)}</span>
                      <span className={styles.previewRatingLabel}>{label}</span>
                    </div>
                  ))}
                  {data.overallRating != null && (
                    <div className={`${styles.previewRating} ${styles.previewRatingOverall}`}>
                      <span className={styles.previewRatingNum}>{data.overallRating.toFixed(2)}</span>
                      <span className={styles.previewRatingLabel}>Overall</span>
                    </div>
                  )}
                </div>
              )}

              <div className={styles.previewSectionHead}>The golf</div>
              {data.courses.length === 0 ? (
                <p className={styles.previewEmpty}>Course lineup coming soon.</p>
              ) : (
                <ul className={styles.previewCourses}>
                  {data.courses.map((c) => (
                    <li key={c.slug} className={styles.previewCourse}>
                      <img src={`/images/courses/${c.slug}.jpg`} alt="" aria-hidden="true" className={styles.previewCourseImg} />
                      <span className={styles.previewCourseInfo}>
                        <span className={styles.previewCourseName}>{c.name}</span>
                        {c.architect && <span className={styles.previewCourseMeta}>{c.architect}</span>}
                      </span>
                      {c.ranking != null && c.ranking <= 100 && (
                        <span className={styles.previewCourseRank}>#{c.ranking}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <Link href={`/trips/${slug}`} target="_blank" rel="noopener noreferrer" className={styles.previewLink}>
                Read the full GTI review →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Results (closed) ─────────────────────────────────────────────────────────────

function Results({ view }: { view: PollView }) {
  const results = view.results;
  if (!results) {
    return (
      <div className={styles.notice}>
        <p className={styles.noticeText}>Voting has closed. Results are being tallied.</p>
      </div>
    );
  }

  const bySlug = (s: string) => view.destinations.find((d) => d.slug === s);
  const max = results.rows.length ? Math.max(1, results.rows[0].score) : 1;
  // The scores are always the group's; the trophy follows the captain's call
  // when they made one, so the page can't show a winner the club isn't taking.
  const called = view.vote?.calledWinner ?? null;
  const winners = new Set(called ? [called] : results.winners);
  const unit = results.type === "ranked" ? "pts" : results.ballotCount === 1 ? "vote" : "votes";

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        {called
          ? `Winner: ${bySlug(called)?.name ?? called} — the captain's call`
          : winners.size === 1
            ? `Winner: ${bySlug(results.winners[0])?.name ?? results.winners[0]}`
            : "It's a tie"}
      </div>
      {results.rows.map((r) => {
        const d = bySlug(r.slug);
        const win = winners.has(r.slug);
        return (
          <div key={r.slug} className={`${styles.resultRow} ${win ? styles.resultRowWin : ""}`}>
            <div className={styles.resultTop}>
              <span className={styles.resultName}>{win ? "🏆 " : ""}{d?.name ?? r.slug}</span>
              <span className={styles.resultScore}>{r.score} {unit}</span>
            </div>
            <div className={styles.resultBarTrack}>
              <div className={styles.resultBar} style={{ width: `${(r.score / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
      <p className={styles.ballotHint}>
        {results.ballotCount} {results.ballotCount === 1 ? "ballot" : "ballots"} counted.
        {called && results.winners[0] !== called && " The captain called the winner."}
      </p>
    </div>
  );
}
