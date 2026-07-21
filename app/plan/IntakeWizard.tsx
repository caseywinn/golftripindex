"use client";

import { useState } from "react";
import styles from "@/styles/plan.module.css";
import { REGIONS, COST_TIERS, DURATION_RANGES, SEASONS } from "@/lib/filters";
import { VIBE_CHOICES, AMBITION_CHOICES, type IntakeAnswers } from "@/lib/intake";

// Step 1 of the trip planner: a one-question-at-a-time wizard. Every step offers
// a "No preference" option (the default — an unset answer means no filter), a
// Next button, and "View recommendations" to finish early from any step. Answers
// map to a runFilter query server-side (see /api/plan/intake); this component
// only collects them.
//
// The current step is owned by the parent (driven by the ?page= query param) so
// the browser Back/Forward buttons step through the wizard — see ShortlistClient.
// This component reports navigation intent via onNext/onBack and only keeps the
// answers themselves in local state.

type SingleKey = "budget" | "length" | "ambition";
type MultiKey = "seasons" | "regions" | "vibes";
type Opt = { slug: string; label: string; sub?: string };

type Step =
  | { key: SingleKey; kind: "single"; label: string; hint?: string; options: Opt[] }
  | { key: MultiKey; kind: "multi"; label: string; hint?: string; options: Opt[] };

const STEPS: Step[] = [
  {
    key: "budget", kind: "single", label: "What's the budget?",
    options: COST_TIERS.map((c) => ({ slug: c.slug, label: c.label, sub: c.display })),
  },
  {
    key: "length", kind: "single", label: "How long a trip?",
    options: DURATION_RANGES.map((d) => ({ slug: d.slug, label: d.label, sub: d.description })),
  },
  {
    key: "seasons", kind: "multi", label: "When are you going?", hint: "Pick any that work",
    options: SEASONS.map((s) => ({ slug: s.slug, label: s.label })),
  },
  {
    key: "regions", kind: "multi", label: "Where to?", hint: "Pick any regions",
    options: REGIONS.map((r) => ({ slug: r.slug, label: r.label })),
  },
  {
    key: "vibes", kind: "multi", label: "What's the vibe?", hint: "Pick any that fit",
    options: VIBE_CHOICES.map((v) => ({ slug: v.slug, label: v.label })),
  },
  {
    key: "ambition", kind: "single", label: "How serious is the golf?",
    options: AMBITION_CHOICES.map((a) => ({ slug: a.slug, label: a.label, sub: a.hint })),
  },
];

// Number of questions — exported so the parent can validate the ?page= param.
export const INTAKE_STEP_COUNT = STEPS.length;

export default function IntakeWizard({
  step,
  onNext,
  onBack,
  onSubmit,
  submitting = false,
  initial,
}: {
  /** Current question index (0-based), driven by the parent's ?page= param. */
  step: number;
  /** Advance to the next question (parent pushes a new history entry). */
  onNext: () => void;
  /** Return to the previous question (parent pops history). */
  onBack: () => void;
  onSubmit: (answers: IntakeAnswers) => void;
  submitting?: boolean;
  initial?: IntakeAnswers;
}) {
  const [answers, setAnswers] = useState<IntakeAnswers>(initial ?? {});

  const total = STEPS.length;
  const s = STEPS[step];
  const isLast = step === total - 1;

  const isActive = (st: Step, slug: string) =>
    st.kind === "single" ? answers[st.key] === slug : (answers[st.key] ?? []).includes(slug);

  // "No preference" is active whenever the current question has no answer.
  const isNoPref = (st: Step) =>
    st.kind === "single" ? !answers[st.key] : !(answers[st.key]?.length);

  const clear = (st: Step) => setAnswers((p) => ({ ...p, [st.key]: undefined }));

  const choose = (st: Step, slug: string) =>
    setAnswers((p) => {
      if (st.kind === "single") return { ...p, [st.key]: slug };
      const arr = p[st.key] ?? [];
      const next = arr.includes(slug) ? arr.filter((v) => v !== slug) : [...arr, slug];
      return { ...p, [st.key]: next.length ? next : undefined };
    });

  const viewLabel = submitting ? "Finding trips…" : "View recommendations";

  return (
    <div className={styles.intakePage}>
      <div className={styles.intakeCard}>
        <header className={styles.intakeHead}>
          <div className={styles.intakeProgress}>
            <span className={styles.intakeStepCount}>Question {step + 1} of {total}</span>
            <div className={styles.intakeProgressBar}>
              <div className={styles.intakeProgressFill} style={{ width: `${((step + 1) / total) * 100}%` }} />
            </div>
          </div>
          <h1 className={styles.intakeTitle}>{s.label}</h1>
          <p className={styles.intakeSub}>{s.hint ?? "Optional — pick one or skip with No preference."}</p>
        </header>

        <div className={styles.intakeBody}>
          <div className={styles.intakeChips}>
            <Chip active={isNoPref(s)} onClick={() => clear(s)}>No preference</Chip>
            {s.options.map((o) => (
              <Chip key={o.slug} active={isActive(s, o.slug)} onClick={() => choose(s, o.slug)}>
                {o.label}
                {o.sub && <span className={styles.intakeChipSub}>{o.sub}</span>}
              </Chip>
            ))}
          </div>
        </div>

        <footer className={styles.intakeFoot}>
          <div className={styles.intakeFootLeft}>
            {step > 0 && (
              <button className={styles.intakeBack} onClick={onBack} disabled={submitting}>
                ← Back
              </button>
            )}
          </div>
          <div className={styles.intakeFootRight}>
            {!isLast && (
              <button className={styles.intakeSkip} onClick={() => onSubmit(answers)} disabled={submitting}>
                {viewLabel}
              </button>
            )}
            {isLast ? (
              <button className={styles.intakePrimary} onClick={() => onSubmit(answers)} disabled={submitting}>
                {viewLabel}
              </button>
            ) : (
              <button className={styles.intakePrimary} onClick={onNext} disabled={submitting}>
                Next →
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`${styles.intakeChip} ${active ? styles.intakeChipActive : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
