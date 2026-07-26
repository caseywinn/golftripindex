"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import stringify from "fast-json-stable-stringify";
import styles from "@/styles/tripDetail.module.css";
import type { TripAttendee, TripVisibility } from "@/lib/clubTrips";

type RosterMember = { userId: string; name: string };

export default function TripAttendeesEditor({
  slug,
  tripId,
  initialAttendees,
  initialVisibility,
  roster,
  canEdit,
}: {
  slug: string;
  tripId: string;
  initialAttendees: TripAttendee[];
  initialVisibility: TripVisibility;
  roster: RosterMember[];
  canEdit: boolean;
}) {
  const router = useRouter();

  // Split saved attendees into roster members (by id) and typed-in guests.
  const [memberIds, setMemberIds] = useState<Set<string>>(
    () => new Set(initialAttendees.filter((a) => a.userId).map((a) => a.userId as string))
  );
  const [guests, setGuests] = useState<TripAttendee[]>(
    initialAttendees.filter((a) => !a.userId)
  );
  const [visibility, setVisibility] = useState<TripVisibility>(initialVisibility);
  const [guestInput, setGuestInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const rosterById = useMemo(() => new Map(roster.map((m) => [m.userId, m])), [roster]);

  // The attendee list as it would be saved (members first, in roster order).
  const attendees: TripAttendee[] = useMemo(() => {
    const members = roster
      .filter((m) => memberIds.has(m.userId))
      .map((m) => ({ userId: m.userId, name: m.name }));
    return [...members, ...guests];
  }, [roster, memberIds, guests]);

  // Stable stringify, not JSON.stringify: attendees are stored in a jsonb column,
  // and Postgres normalizes object key order on the way out. We send
  // {userId, name} and read back {name, userId}, so a plain stringify compare
  // never matched even when nothing had changed — dirty was stuck true, which
  // left the Save button permanently enabled and meant the saved confirmation
  // (gated on !dirty) could never appear at all.
  const dirty = useMemo(
    () => stringify(attendees) !== stringify(initialAttendees) || visibility !== initialVisibility,
    [attendees, initialAttendees, visibility, initialVisibility]
  );

  function toggleMember(userId: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    setSaved(false);
  }

  function addGuest() {
    const name = guestInput.trim();
    if (!name) return;
    const dup =
      guests.some((g) => g.name.toLowerCase() === name.toLowerCase()) ||
      roster.some((m) => memberIds.has(m.userId) && m.name.toLowerCase() === name.toLowerCase());
    if (!dup) setGuests((prev) => [...prev, { userId: null, name }]);
    setGuestInput("");
    setSaved(false);
  }

  function removeGuest(i: number) {
    setGuests((prev) => prev.filter((_, idx) => idx !== i));
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
        body: JSON.stringify({ attendees, visibility }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(data.error || "Could not save.");
      }
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Read-only view (members who don't manage) ──────────────────────────────
  if (!canEdit) {
    if (initialAttendees.length === 0) {
      return <p className={styles.sectionEmpty}>No attendees recorded yet.</p>;
    }
    return (
      <ul className={styles.attList}>
        {initialAttendees.map((a, i) => (
          <li key={`${a.name}-${i}`} className={styles.attChip}>{a.name}</li>
        ))}
      </ul>
    );
  }

  // ── Manager editor ─────────────────────────────────────────────────────────
  return (
    <div>
      {roster.length > 0 && (
        <div className={styles.attRoster}>
          {roster.map((m) => {
            const on = memberIds.has(m.userId);
            return (
              <button
                key={m.userId}
                type="button"
                className={`${styles.attToggle} ${on ? styles.attToggleOn : ""}`}
                onClick={() => toggleMember(m.userId)}
                aria-pressed={on}
              >
                <span className={styles.attCheck} aria-hidden="true">{on ? "✓" : "+"}</span>
                {rosterById.get(m.userId)?.name ?? m.name}
              </button>
            );
          })}
        </div>
      )}

      {guests.length > 0 && (
        <div className={styles.attGuests}>
          {guests.map((g, i) => (
            <span key={`${g.name}-${i}`} className={styles.attGuestChip}>
              {g.name}
              <button
                className={styles.attGuestX}
                onClick={() => removeGuest(i)}
                aria-label={`Remove ${g.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={styles.courseAddRow}>
        <div className={styles.courseInputWrap}>
          <input
            className={styles.courseInput}
            value={guestInput}
            onChange={(e) => setGuestInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGuest(); } }}
            placeholder="Add a guest who isn't in the club"
            maxLength={120}
          />
        </div>
        <button className={styles.courseAddBtn} onClick={addGuest} disabled={!guestInput.trim()}>
          Add
        </button>
      </div>

      {/* Visibility — depends on who came, so it lives with the attendee list. */}
      <fieldset className={styles.visBox}>
        <legend className={styles.visLegend}>Who can see this trip</legend>
        <label className={styles.visOpt}>
          <input
            type="radio"
            name="visibility"
            checked={visibility === "club"}
            onChange={() => { setVisibility("club"); setSaved(false); }}
          />
          <span>
            <span className={styles.visOptLabel}>All club members</span>
            <span className={styles.visOptHint}>Anyone in the club can see the recap.</span>
          </span>
        </label>
        <label className={styles.visOpt}>
          <input
            type="radio"
            name="visibility"
            checked={visibility === "attendees"}
            onChange={() => { setVisibility("attendees"); setSaved(false); }}
          />
          <span>
            <span className={styles.visOptLabel}>Only people who came</span>
            <span className={styles.visOptHint}>Just attendees (and club admins) can see it.</span>
          </span>
        </label>
      </fieldset>

      {error && <p className={styles.sectionErr}>{error}</p>}

      {/* The confirmation is its own element rather than the button's label: a
          button that relabels itself and greys out is easy to miss, and a
          role="status" node is announced to screen readers. It clears on the next
          edit, since every mutator resets `saved`. */}
      <div className={styles.saveRow}>
        <button className={styles.saveBtn} onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && !dirty && (
          <span className={styles.saveNote} role="status">
            Saved ✓
          </span>
        )}
      </div>
    </div>
  );
}
