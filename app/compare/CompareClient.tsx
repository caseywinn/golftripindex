"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "@/styles/compare.module.css";
import { matchupPath, matchupTitle, matchupIntro } from "@/lib/seo";

type TripOption = { name: string; slug: string };

type GenerateOutput = {
  teaser: string;
  article_markdown: string;
  facts_sidebar: string[];
};

type CompareResponse = {
  cacheKey: string;
  cached: boolean;
  output: GenerateOutput;
  pack_meta?: {
    generated_at: string;
    data_version: string;
    tripA: { name: string; slug: string };
    tripB: { name: string; slug: string };
  };
};

const PHASES = [
  "Preparing the matchup…",
  "Comparing the golf…",
  "Evaluating lodging and hang…",
  "Weighing food and off-course options…",
  "Thinking through travel and logistics…",
  "Pressure-testing value…",
  "Dialing in the vibe…",
  "Writing the verdict…",
];

// Shared with the server so a client-side router.replace lands on the same
// URL the page canonicals to, rather than a second ordering of the same pair.
const buildCanonicalPath = matchupPath;

function parseCompareFromSearchParams(sp: URLSearchParams): { A: string; B: string } | null {
  // Supported:
  // 1) ?A=aspen&B=arcadia-bluffs (preferred explicit)
  // 2) ?aspen&arcadia-bluffs (keys with empty values)

  const A = sp.get("A") || sp.get("a");
  const B = sp.get("B") || sp.get("b");
  if (A && B && A !== B) return { A, B };

  const keys = Array.from(sp.keys()).filter((k) => !["A", "a", "B", "b"].includes(k));
  if (keys.length >= 2 && keys[0] !== keys[1]) return { A: keys[0], B: keys[1] };

  return null;
}

function parsePairFromPathname(pathname: string): { A: string; B: string } | null {
  // Supports:
  // /compare/aspen-vs-arcadia-bluffs
  // /compare/aspen/arcadia-bluffs

  const prefix = "/compare";
  if (!pathname.startsWith(prefix)) return null;

  const tail = pathname.slice(prefix.length); // "" or "/..."
  const cleaned = tail.replace(/^\/+/, "");
  if (!cleaned) return null;

  const segments = cleaned.split("/").filter(Boolean);

  // /compare/A/B
  if (segments.length >= 2) {
    const A = decodeURIComponent(segments[0] ?? "").trim();
    const B = decodeURIComponent(segments[1] ?? "").trim();
    if (!A || !B || A === B) return null;
    return { A, B };
  }

  // /compare/A-vs-B
  const raw = segments[0];
  const parts = raw.split("-vs-");
  if (parts.length !== 2) return null;

  const A = decodeURIComponent(parts[0] ?? "").trim();
  const B = decodeURIComponent(parts[1] ?? "").trim();
  if (!A || !B || A === B) return null;

  return { A, B };
}

export default function CompareClient({
  initialA = "",
  initialB = "",
  initialNameA = "",
  initialNameB = "",
}: {
  initialA?: string;
  initialB?: string;
  /**
   * Trip names resolved on the server. The dropdown list arrives from a client
   * fetch, so without these the H1 renders "Head-to-Head" in the server HTML —
   * which is what a crawler keeps.
   */
  initialNameA?: string;
  initialNameB?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [trips, setTrips] = useState<TripOption[]>([]);

  // Draft selections (dropdowns). Changing these should NOT clear the page.
  // Seeded from the server-resolved pair so the first paint — including the
  // server HTML — already shows the matchup rather than an empty picker.
  const [draftA, setDraftA] = useState<string>(initialA);
  const [draftB, setDraftB] = useState<string>(initialB);

  // Committed selections (used for the actual comparison + heading + option filtering).
  const [a, setA] = useState<string>(initialA);
  const [b, setB] = useState<string>(initialB);

  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean>(false);
  const [output, setOutput] = useState<GenerateOutput | null>(null);
  const [meta, setMeta] = useState<CompareResponse["pack_meta"] | null>(null);

  const [loadingTrips, setLoadingTrips] = useState<boolean>(true);
  const [comparing, setComparing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Spinner phase text
  const [phaseIndex, setPhaseIndex] = useState<number>(0);

  // Ensure auto-run happens only once per direct-load pair
  const autorunKeyRef = useRef<string>("");

  // ---- Load trips for dropdowns ----
  useEffect(() => {
    (async () => {
      setLoadingTrips(true);
      const res = await fetch("/api/trips/list");
      const data = await res.json();
      setTrips(data.trips || []);
      setLoadingTrips(false);
    })().catch((e) => {
      setError(String(e));
      setLoadingTrips(false);
    });
  }, []);

  // ---- Derived dropdown options (prevent selecting same trip) ----
  const optionsForA = useMemo(() => trips.filter((t) => t.slug !== draftB), [trips, draftB]);
  const optionsForB = useMemo(() => trips.filter((t) => t.slug !== draftA), [trips, draftA]);

  const canCompare = Boolean(draftA && draftB && draftA !== draftB) && !comparing;

  // Fall back to the server-resolved names until the dropdown list lands.
  const tripAName = useMemo(
    () => trips.find((t) => t.slug === a)?.name ?? (a === initialA ? initialNameA : ""),
    [trips, a, initialA, initialNameA],
  );
  const tripBName = useMemo(
    () => trips.find((t) => t.slug === b)?.name ?? (b === initialB ? initialNameB : ""),
    [trips, b, initialB, initialNameB],
  );

  // Clear downstream state ONLY when committed comparison pair changes
  useEffect(() => {
    if (!a || !b) return;
    setOutput(null);
    setMeta(null);
    setCacheKey(null);
    setCached(false);
    setError(null);
  }, [a, b]);

  // Phased statuses while comparing
  useEffect(() => {
    if (!comparing) {
      setPhaseIndex(0);
      return;
    }

    setPhaseIndex(0);

    const id = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % PHASES.length);
    }, 2500);

    return () => clearInterval(id);
  }, [comparing]);

  async function runCompare(
    nextA: string,
    nextB: string,
    opts?: { bypassCache?: boolean; updateUrl?: boolean }
  ) {
    if (!nextA || !nextB || nextA === nextB) return;

    // Commit
    setA(nextA);
    setB(nextB);

    // Canonicalize URL when requested
    if (opts?.updateUrl) {
      router.replace(buildCanonicalPath(nextA, nextB), { scroll: false });
    }

    setError(null);
    setOutput(null);
    setMeta(null);
    setCacheKey(null);
    setCached(false);

    setComparing(true);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          A: nextA,
          B: nextB,
          bypassCache: Boolean(opts?.bypassCache),
        }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Non-JSON response (${res.status}): ${text?.slice(0, 200)}`);
      }

      if (!res.ok) {
        setError(data?.error || "Compare failed");
        return;
      }

      const parsed = data as CompareResponse;
      setCacheKey(parsed.cacheKey || null);
      setCached(Boolean(parsed.cached));
      setMeta(parsed.pack_meta ?? null);
      setOutput(parsed.output as GenerateOutput);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setComparing(false);
    }
  }

  async function compareTrips(opts?: { bypassCache?: boolean }) {
    return runCompare(draftA, draftB, {
      bypassCache: Boolean(opts?.bypassCache),
      updateUrl: true, // Compare button always writes canonical
    });
  }

  // =========================
  // AUTO-RUN ON DIRECT LOAD
  // =========================
  useEffect(() => {
    // Determine pair from (1) server props, (2) canonical pathname, (3) legacy query
    const fromProps = initialA && initialB ? { A: initialA, B: initialB } : null;
    const fromPath = parsePairFromPathname(pathname);
    const fromQuery = parseCompareFromSearchParams(searchParams);

    const pair = fromProps || fromPath || fromQuery;
    if (!pair) return;

    const key = `${pair.A}::${pair.B}`;
    if (autorunKeyRef.current === key) return;

    // Seed UI
    setDraftA(pair.A);
    setDraftB(pair.B);

    // If coming from legacy query, normalize to canonical immediately
    if (fromQuery && !fromPath && !fromProps) {
      router.replace(buildCanonicalPath(pair.A, pair.B), { scroll: false });
    }

    autorunKeyRef.current = key;

    // Kick off comparison immediately (do NOT wait for trips list)
    runCompare(pair.A, pair.B, { updateUrl: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialA, initialB, pathname, searchParams]);

  // Hero image strategy:
  const heroSrc = `/comparison-hero.jpg`;
  const fallbackHeroSrc = a ? `/images/trips/${a}.jpg` : `/images/compare/placeholder.jpg`;

  const hasPair = Boolean(tripAName && tripBName);
  const title = hasPair
    ? matchupTitle(tripAName, tripBName)
    : "Compare Golf Trips";
  const standfirst = hasPair
    ? matchupIntro(tripAName, tripBName)
    : "Select two golf trips to compare. This tool goes beyond surface-level rankings to break down how each trip actually plays out so you can see which one truly fits the kind of trip you want to take.";

  return (
    <main className={styles.page}>

      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.heroImageWrap}>
          <Image
            src={heroSrc}
            alt={hasPair ? `${tripAName} vs ${tripBName}` : "Golf trip comparison"}
            fill
            priority
            className={styles.heroImage}
            sizes="(max-width: 900px) 100vw, 60vw"
            onError={(e) => {
              const img = e.currentTarget as any;
              if (img?.src && !img.src.includes(fallbackHeroSrc)) {
                img.src = fallbackHeroSrc;
              }
            }}
          />
        </div>

        <div className={styles.heroPanel}>
          <h1 className={styles.title}>{title}</h1>

          <p className={styles.teaser}>{standfirst}</p>

          {/*<div className={styles.meta}>
            <span>
              {comparing
                ? "The Caddie is taking a moment to study both trips—comparing the golf, the journey, and how each experience actually unfolds."
                : output
                ? "Ready"
                : "Select two golf trips to compare. This tool goes beyond surface-level rankings to break down how each trip actually plays out so you can see which one truly fits the kind of trip you want to take."}
            </span>
            {meta?.generated_at ? (
              <>
                <span className={styles.dot}>•</span>
                <span>{new Date(meta.generated_at).toLocaleDateString()}</span>
              </>
            ) : null}
            {cacheKey ? (
              <>
                <span className={styles.dot}>•</span>
                <span>{cached ? "cached" : "fresh"}</span>
              </>
            ) : null}
          </div>*/}

          {/* Controls */}
          <div className={styles.comparisons}>
            <label style={{ display: "block" }}>
              Trip A
              <br />
              <select
                value={draftA}
                onChange={(e) => setDraftA(e.target.value)}
                style={{ minWidth: 180 }}
                disabled={loadingTrips || comparing}
              >
                <option value="">{loadingTrips ? "Loading…" : "Select…"}</option>
                {optionsForA.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "block" }}>
              Trip B
              <br />
              <select
                value={draftB}
                onChange={(e) => setDraftB(e.target.value)}
                style={{ minWidth: 180 }}
                disabled={loadingTrips || comparing}
              >
                <option value="">{loadingTrips ? "Loading…" : "Select…"}</option>
                {optionsForB.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ alignSelf: "end", display: "flex", gap: 12 }}>
              <button onClick={() => compareTrips()} disabled={!canCompare}>
                {comparing ? "Comparing…" : "Compare"}
              </button>
            </div>
          </div>

          {draftA && draftB && draftA === draftB ? (
            <p style={{ color: "crimson", marginTop: 12 }}>
              Trip A and Trip B must be different.
            </p>
          ) : null}

          {error ? <p style={{ color: "crimson", marginTop: 12 }}>{error}</p> : null}
        </div>
      </section>

      {/* BODY */}
      <section className={styles.body}>
        <article className={styles.article}>
          {comparing ? (
            <div className={styles.articleLoading} aria-live="polite" aria-busy="true" role="status">
              <div className={styles.articleLoadingInner}>
                <div className={styles.articleSpinner} />
                <div className={styles.articlePhase}>{PHASES[phaseIndex]}</div>
                <div className={styles.articleSubphase}>
                  This can take ~10–20 seconds on a fresh generation.
                </div>
              </div>
            </div>
          ) : output ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ children }) => <h2 className={styles.h2}>{children}</h2>,
                p: ({ children }) => <p className={styles.p}>{children}</p>,
                a: ({ href, children }) => (
                  <a href={href} className={styles.articleLink}>
                    {children}
                  </a>
                ),
                ul: ({ children }) => <ul style={{ margin: "0 0 18px", paddingLeft: 18 }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ margin: "0 0 18px", paddingLeft: 18 }}>{children}</ol>,
                li: ({ children }) => <li style={{ marginBottom: 6 }}>{children}</li>,
                strong: ({ children }) => <strong>{children}</strong>,
              }}
            >
              {output.article_markdown}
            </ReactMarkdown>
          ) : null}
        </article>
      </section>
    </main>
  );
}