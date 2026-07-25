"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/clubs.module.css";

type TripOpt = { slug: string; name: string };

export default function AddPastTrip({ slug, trips }: { slug: string; trips: TripOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  // Set when the destination is chosen from autocomplete — links the trip to that
  // GTI catalog trip so its courses feed the recap. Cleared on free-text editing.
  const [destinationSlug, setDestinationSlug] = useState<string | null>(null);
  const [destOpen, setDestOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const destSuggest = useMemo(() => {
    const q = destination.trim().toLowerCase();
    if (!q || destinationSlug) return [];
    return trips.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6);
  }, [destination, destinationSlug, trips]);

  function reset() {
    setTitle("");
    setDestination("");
    setDestinationSlug(null);
    setStartDate("");
    setEndDate("");
    setError("");
  }

  async function save() {
    if (saving) return;
    if (!title.trim()) {
      setError("Give the trip a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clubs/${encodeURIComponent(slug)}/past-trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          destination: destination.trim() || null,
          destinationSlug,
          startDate: startDate || null,
          endDate: endDate || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        reset();
        setOpen(false);
        router.refresh(); // re-render the server page so the new trip appears
      } else {
        setError(data.error || "Could not add the trip.");
      }
    } catch {
      setError("Could not add the trip. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.pastAdd}>
      <button
        className={styles.pastAddLink}
        onClick={() => { if (open) reset(); setOpen((o) => !o); }}
        aria-expanded={open}
      >
        {open ? "Close" : "Add a past trip"}
      </button>

      {open && (
        <div className={styles.pastPanel}>
          <label className={styles.pastField}>
        <span className={styles.pastLabel}>Trip name</span>
        <input
          className={styles.pastInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Bandon buddies trip"
          maxLength={120}
          autoFocus
        />
      </label>

      <div className={styles.pastField}>
        <span className={styles.pastLabel}>
          Destination <span className={styles.pastOptional}>Optional</span>
        </span>
        <div className={styles.pastAutoWrap}>
          <input
            className={styles.pastInput}
            value={destination}
            onChange={(e) => { setDestination(e.target.value); setDestinationSlug(null); setDestOpen(true); }}
            onFocus={() => setDestOpen(true)}
            onBlur={() => setDestOpen(false)}
            placeholder="Search GTI trips, or type a place"
            maxLength={120}
            autoComplete="off"
          />
          {destOpen && destSuggest.length > 0 && (
            <ul className={styles.pastSuggest}>
              {destSuggest.map((t) => (
                <li key={t.slug}>
                  <button
                    type="button"
                    className={styles.pastSuggestItem}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setDestination(t.name); setDestinationSlug(t.slug); setDestOpen(false); }}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {destinationSlug && (
            <span className={styles.pastLinkedNote}>Linked — its courses will be available on the trip page.</span>
          )}
        </div>
      </div>

      <div className={styles.pastDates}>
        <label className={styles.pastField}>
          <span className={styles.pastLabel}>
            Start <span className={styles.pastOptional}>Optional</span>
          </span>
          <input
            className={styles.pastInput}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className={styles.pastField}>
          <span className={styles.pastLabel}>
            End <span className={styles.pastOptional}>Optional</span>
          </span>
          <input
            className={styles.pastInput}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      {error && <p className={styles.pastErr}>{error}</p>}

      <div className={styles.pastActions}>
        <button className={styles.tripActionBtn} onClick={save} disabled={saving}>
          {saving ? "Adding…" : "Add trip"}
        </button>
            <button
              className={styles.tripActionBtn}
              onClick={() => { setOpen(false); reset(); }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
