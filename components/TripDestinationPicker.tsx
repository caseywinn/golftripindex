"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/tripDetail.module.css";

type TripOpt = { slug: string; name: string };

/**
 * Links a club trip to a GTI destination so its courses + golf side trips feed
 * the "courses played" dropdown. A voted trip is already linked (its winner is a
 * real slug); this is mainly for manually recorded trips, whose destination is
 * free text until a manager picks the catalog trip here.
 */
export default function TripDestinationPicker({
  slug,
  tripId,
  trips,
  linkedSlug,
  linkedName,
}: {
  slug: string;
  tripId: string;
  trips: TripOpt[];
  linkedSlug: string | null;
  linkedName: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!linkedSlug);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return trips.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [input, trips]);

  async function setDestination(destinationSlug: string | null) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clubs/${encodeURIComponent(slug)}/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationSlug }),
      });
      const data = await res.json();
      if (res.ok) {
        setInput("");
        setOpen(false);
        setEditing(destinationSlug === null); // keep the picker open after unlinking
        router.refresh(); // reloads the course options for the new destination
      } else {
        setError(data.error || "Could not link the trip.");
      }
    } catch {
      setError("Could not link the trip. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // Linked and settled: a compact line with a Change affordance.
  if (linkedSlug && !editing) {
    return (
      <p className={styles.destLinked}>
        Pulling courses from <b>{linkedName ?? linkedSlug}</b>
        <button className={styles.destChange} onClick={() => setEditing(true)} disabled={saving}>
          Change
        </button>
      </p>
    );
  }

  return (
    <div className={styles.destBox}>
      <label className={styles.destLabel}>
        Link this trip to a GTI destination to pull its courses
      </label>
      <div className={styles.destRow}>
        <div className={styles.courseInputWrap}>
          <input
            className={styles.courseInput}
            value={input}
            onChange={(e) => { setInput(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            placeholder="Search GTI trips…"
            disabled={saving}
          />
          {open && suggestions.length > 0 && (
            <ul className={styles.courseSuggest}>
              {suggestions.map((t) => (
                <li key={t.slug}>
                  <button
                    type="button"
                    className={styles.courseSuggestItem}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setDestination(t.slug)}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {linkedSlug && (
          <button className={styles.courseAddBtn} onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
      {linkedSlug && (
        <button className={styles.destUnlink} onClick={() => setDestination(null)} disabled={saving}>
          Remove link
        </button>
      )}
      {error && <p className={styles.sectionErr}>{error}</p>}
    </div>
  );
}
