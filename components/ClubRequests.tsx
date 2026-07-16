"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/clubs.module.css";

export type PendingRequest = { email: string; name: string | null };

/**
 * Pending join requests in the rail, above the roster. Only rendered for
 * owners/admins, and only when there's at least one — an empty section would be
 * dead weight in a 300px column.
 */
export default function ClubRequests({
  slug,
  requests,
  seatsLeft,
}: {
  slug: string;
  requests: PendingRequest[];
  seatsLeft: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(email: string, action: "approve" | "reject") {
    if (busy) return;
    setBusy(email);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${encodeURIComponent(slug)}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "That didn't work.");
        return;
      }
      router.refresh();
    } catch {
      setError("That didn't work. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  if (!requests.length) return null;

  return (
    <div className={styles.railSection}>
      <div className={styles.railSectionRow}>
        <span className={styles.railSectionLabel}>Requests</span>
        <span className={styles.reqBadge}>{requests.length}</span>
      </div>

      {requests.map((r) => (
        <div key={r.email} className={styles.reqRow}>
          <div className={styles.who}>
            <div className={styles.mname}>{r.name ?? r.email}</div>
            {r.name && <div className={styles.mmail}>{r.email}</div>}
          </div>
          <div className={styles.reqActions}>
            <button
              className={styles.reqApprove}
              onClick={() => act(r.email, "approve")}
              /* Approving is what consumes a seat, so it's the action that has
                 to go away at the limit — rejecting must stay available. */
              disabled={busy === r.email || seatsLeft <= 0}
              title={seatsLeft <= 0 ? "No seats left" : "Approve"}
            >
              Approve
            </button>
            <button
              className={styles.reqReject}
              onClick={() => act(r.email, "reject")}
              disabled={busy === r.email}
            >
              Reject
            </button>
          </div>
        </div>
      ))}

      {error && <p className={styles.railError}>{error}</p>}
      {seatsLeft <= 0 && (
        <p className={styles.seatNote}>No seats left — upgrade to approve anyone new.</p>
      )}
    </div>
  );
}
