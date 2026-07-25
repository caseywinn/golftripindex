"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/tripDetail.module.css";
import type { TripCourse } from "@/lib/clubTrips";

type CourseOption = { slug: string; name: string; state?: string };

export default function TripCoursesEditor({
  slug,
  tripId,
  initialCourses,
  options,
  catalog,
  canEdit,
}: {
  slug: string;
  tripId: string;
  initialCourses: TripCourse[];
  /** Courses + golf side trips tied to this trip, offered as a dropdown. */
  options: CourseOption[];
  /** Every course in the catalog, for the by-hand input's autocomplete. */
  catalog: CourseOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState<TripCourse[]>(initialCourses);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(courses) !== JSON.stringify(initialCourses),
    [courses, initialCourses]
  );

  const has = (name: string) => courses.some((c) => c.name.toLowerCase() === name.trim().toLowerCase());

  // Trip courses not already added — the dropdown's live choices.
  const remainingOptions = useMemo(
    () => options.filter((o) => !has(o.name)),
    [options, courses] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Catalog suggestions for the by-hand input: only once the user types, matches
  // not already added, capped — never the whole catalog on focus.
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((c) => c.name.toLowerCase().includes(q) && !has(c.name)).slice(0, 6);
  }, [input, catalog, courses]); // eslint-disable-line react-hooks/exhaustive-deps

  function addCourse(c: TripCourse) {
    if (!c.name.trim() || has(c.name)) return;
    setCourses((prev) => [...prev, { slug: c.slug, name: c.name.trim() }]);
    setSaved(false);
  }

  // Add whatever's typed. If it exactly matches a catalog course, attach that
  // course's slug; otherwise it's a free-text (off-catalog) entry.
  function addTyped() {
    const name = input.trim();
    if (!name) return;
    const match = catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
    addCourse({ slug: match?.slug ?? null, name: match?.name ?? name });
    setInput("");
    setOpen(false);
  }

  function removeCourse(i: number) {
    setCourses((prev) => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clubs/${encodeURIComponent(slug)}/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses }),
      });
      const data = await res.json();
      if (res.ok) {
        setCourses(data.courses ?? courses);
        setSaved(true);
        router.refresh();
      } else {
        setError(data.error || "Could not save the courses.");
      }
    } catch {
      setError("Could not save the courses. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {courses.length === 0 && !canEdit && (
        <p className={styles.sectionEmpty}>No courses recorded yet.</p>
      )}

      {courses.length > 0 && (
        <div className={styles.courseChips}>
          {courses.map((c, i) => (
            <span key={`${c.name}-${i}`} className={styles.courseChip}>
              {c.name}
              {canEdit && (
                <button
                  className={styles.courseChipX}
                  onClick={() => removeCourse(i)}
                  aria-label={`Remove ${c.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && (
        <>
          {/* Dropdown of this trip's own courses + golf side trips. */}
          {remainingOptions.length > 0 && (
            <select
              className={styles.courseSelect}
              value=""
              onChange={(e) => {
                const o = options.find((x) => x.slug === e.target.value);
                if (o) addCourse({ slug: o.slug, name: o.name });
              }}
            >
              <option value="">Add a course from this trip…</option>
              {remainingOptions.map((o) => (
                <option key={o.slug} value={o.slug}>{o.name}</option>
              ))}
            </select>
          )}

          {/* Add by hand — autocompletes over the whole catalog, or takes any
              course you type that isn't in it. */}
          <div className={styles.courseAddRow}>
            <div className={styles.courseInputWrap}>
              <input
                className={styles.courseInput}
                value={input}
                onChange={(e) => { setInput(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } }}
                placeholder="Add a course by hand — search all courses or type your own"
                maxLength={120}
                autoComplete="off"
              />
              {open && suggestions.length > 0 && (
                <ul className={styles.courseSuggest}>
                  {suggestions.map((c) => (
                    <li key={c.slug}>
                      <button
                        type="button"
                        className={styles.courseSuggestItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { addCourse({ slug: c.slug, name: c.name }); setInput(""); setOpen(false); }}
                      >
                        <span>{c.name}</span>
                        {c.state && <span className={styles.courseSuggestMeta}>{c.state}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button className={styles.courseAddBtn} onClick={addTyped} disabled={!input.trim()}>
              Add
            </button>
          </div>

          {error && <p className={styles.sectionErr}>{error}</p>}

          <div className={styles.saveRow}>
            <button className={styles.saveBtn} onClick={save} disabled={saving || !dirty}>
              {saving ? "Saving…" : saved && !dirty ? "Saved ✓" : "Save courses"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
