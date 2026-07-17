"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/clubs.module.css";

/**
 * Admin controls for moving a trip out of the open set.
 *
 * Only one trip can be open at a time, so without these a club's first trip
 * blocks every future proposal forever — and a poll that ends in a tie locks no
 * winner and has nowhere to go. "Shelve" is the escape hatch for both.
 */
export default function ClubTripActions({
  slug,
  tripId,
  canComplete,
}: {
  slug: string;
  tripId: string;
  /** Only a trip that's been planned can be marked played (matches the route). */
  canComplete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"complete" | "archive" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "complete" | "archive") {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/clubs/${encodeURIComponent(slug)}/trips/${encodeURIComponent(tripId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't update the trip.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Couldn't update the trip. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.tripActions}>
      {canComplete && (
        <button
          className={styles.tripActionBtn}
          onClick={() => act("complete")}
          disabled={!!busy}
        >
          {busy === "complete" ? "Saving…" : "Mark as played"}
        </button>
      )}

      {/* Shelving throws away a vote the club already took, so it asks first. */}
      {confirming ? (
        <>
          <button
            className={styles.tripActionDanger}
            onClick={() => act("archive")}
            disabled={!!busy}
          >
            {busy === "archive" ? "Shelving…" : "Yes, shelve it"}
          </button>
          <button
            className={styles.tripActionBtn}
            onClick={() => setConfirming(false)}
            disabled={!!busy}
          >
            Keep it
          </button>
        </>
      ) : (
        <button
          className={styles.tripActionBtn}
          onClick={() => setConfirming(true)}
          disabled={!!busy}
        >
          Shelve trip
        </button>
      )}

      {error && <p className={styles.tripActionError}>{error}</p>}
    </div>
  );
}
