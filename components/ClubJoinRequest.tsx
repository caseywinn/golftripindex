"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/clubs.module.css";

/** The stub's call to action for a non-member. */
export default function ClubJoinRequest({
  slug,
  pending,
}: {
  slug: string;
  /** They've already asked and are waiting on an owner. */
  pending: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "sent">(pending ? "sent" : "idle");
  const [error, setError] = useState<string | null>(null);

  async function request() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${encodeURIComponent(slug)}/request`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send your request.");
        return;
      }
      // "joined" means an invite was already waiting for them — they're in now,
      // so re-render into the full club page rather than a pending state.
      if (data?.outcome === "joined" || data?.outcome === "member") {
        router.refresh();
        return;
      }
      setState("sent");
      router.refresh();
    } catch {
      setError("Couldn't send your request. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "sent") {
    return (
      <div className={styles.stubPending}>
        <p className={styles.stubPendingText}>
          Request sent. A club admin will let you know.
        </p>
      </div>
    );
  }

  return (
    <div>
      <button className={styles.stubBtn} onClick={request} disabled={busy}>
        {busy ? "Sending…" : "Request to join"}
      </button>
      {error && <p className={styles.stubError}>{error}</p>}
    </div>
  );
}
