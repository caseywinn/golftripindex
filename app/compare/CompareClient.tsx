"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "@/styles/compare.module.css";

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

export default function CompareClient() {
  const [trips, setTrips] = useState<TripOption[]>([]);

  // Draft selections (dropdowns). Changing these should NOT clear the page.
  const [draftA, setDraftA] = useState<string>("");
  const [draftB, setDraftB] = useState<string>("");

  // Committed selections (used for the actual comparison + heading + option filtering).
  // These only change when the user clicks Compare.
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");

  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean>(false);
  const [output, setOutput] = useState<GenerateOutput | null>(null);
  const [meta, setMeta] = useState<CompareResponse["pack_meta"] | null>(null);

  const [loadingTrips, setLoadingTrips] = useState<boolean>(true);
  const [comparing, setComparing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Spinner phase text
  const [phaseIndex, setPhaseIndex] = useState<number>(0);

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
  // Use DRAFT selection to filter the opposite dropdown (nice UX), but don't touch output.
  const optionsForA = useMemo(() => trips.filter((t) => t.slug !== draftB), [trips, draftB]);
  const optionsForB = useMemo(() => trips.filter((t) => t.slug !== draftA), [trips, draftA]);

  // Compare button enablement should be based on DRAFT selections.
  const canCompare = Boolean(draftA && draftB && draftA !== draftB) && !comparing;

  // Titles should reflect the last COMMITTED comparison (a/b), not the drafts.
  const tripAName = useMemo(() => trips.find((t) => t.slug === a)?.name ?? "", [trips, a]);
  const tripBName = useMemo(() => trips.find((t) => t.slug === b)?.name ?? "", [trips, b]);

  // Clear downstream state ONLY when the committed comparison pair changes (i.e., Compare clicked).
  useEffect(() => {
    if (!a || !b) return; // don't clear on initial mount
    setOutput(null);
    setMeta(null);
    setCacheKey(null);
    setCached(false);
    setError(null);
  }, [a, b]);

  // Phased statuses while comparing (perceived speed)
  useEffect(() => {
    if (!comparing) {
      setPhaseIndex(0);
      return;
    }

    // Start with a quick jump from "Preparing…" to the comparison phases
    setPhaseIndex(0);

    const id = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % PHASES.length);
    }, 2500);

    return () => clearInterval(id);
  }, [comparing]);

  async function compareTrips(opts?: { bypassCache?: boolean }) {
    // Commit the drafts first. This is what ensures dropdown changes don't wipe the page.
    const nextA = draftA;
    const nextB = draftB;

    if (!nextA || !nextB || nextA === nextB) return;

    setA(nextA);
    setB(nextB);

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

      // Robust JSON parsing (prevents "Unexpected end of JSON input")
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

  // Hero image strategy:
  // 1) dedicated compare hero: /public/images/compare/{a}-vs-{b}.jpg (optional)
  // 2) fallback: Trip A hero
  const heroSrc = `/comparison-hero.jpg`;
  const fallbackHeroSrc = a ? `/images/trips/${a}.jpg` : `/images/compare/placeholder.jpg`;

  const title = tripAName && tripBName ? `${tripAName} vs ${tripBName}` : "Head-to-Head";
  const teaser = output?.teaser ?? "";

  return (
    <main className={styles.page}>
      {/* ================= SPINNER OVERLAY (BIG) ================= */}
      {comparing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(255,255,255,0.95)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 18,
          }}
          aria-live="polite"
          aria-busy="true"
          role="status"
        >
          <div
            style={{
              width: 88,
              height: 88,
              border: "7px solid #e5e5e5",
              borderTopColor: "#111",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <div
            style={{
              fontSize: 16,
              opacity: 0.85,
              transition: "opacity 250ms ease",
              textAlign: "center",
              padding: "0 18px",
              maxWidth: 560,
              lineHeight: 1.35,
            }}
          >
            {PHASES[phaseIndex]}
          </div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>
            This can take ~10–20 seconds on a fresh generation.
          </div>
        </div>
      )}
      {/* ========================================================= */}

      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.heroImageWrap}>
          <Image
            src={heroSrc}
            alt={title}
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

          {/* {teaser ? <p className={styles.teaser}>{teaser}</p> : null} */}

          <div className={styles.meta}>
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
          </div>

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

              {/* Optional regenerate */}
              {/* <button
                onClick={() => compareTrips({ bypassCache: true })}
                disabled={!Boolean(draftA && draftB && draftA !== draftB) || comparing}
                title="Bypasses cache to generate a fresh draft"
              >
                {comparing ? "Regenerating…" : "Regenerate"}
              </button> */}
            </div>
          </div>

          {/* Validation / error (based on DRAFT) */}
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
          {output ? (
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

          {/* Optional debug */}
          {/* {cacheKey ? (
            <div style={{ marginTop: 20, fontSize: 12, opacity: 0.6 }}>
              Cache key: {cacheKey} | {cached ? "cached" : "fresh"}
            </div>
          ) : null} */}
        </article>
      </section>

      {/* Spinner animation */}
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}
