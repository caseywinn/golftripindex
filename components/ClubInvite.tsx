"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/clubs.module.css";

export default function ClubInvite({
  slug,
  seatsLeft,
}: {
  slug: string;
  seatsLeft: number;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const full = seatsLeft <= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || full) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/clubs/${encodeURIComponent(slug)}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send the invite.");
        return;
      }
      setEmail("");
      setNote(
        data?.outcome === "member"
          ? "They're already on the roster."
          : data?.outcome === "resent"
            ? "Invite resent."
            : "Invite sent."
      );
      // The roster and seat meter are server-rendered, so pull the new row down.
      router.refresh();
    } catch {
      setError("Couldn't send the invite. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.railActions} onSubmit={submit}>
      <input
        type="email"
        className={styles.inviteInput}
        placeholder="golfer@email.com"
        aria-label="Email to invite"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy || full}
        required
      />
      <button type="submit" className={styles.inviteBtn} disabled={busy || full || !email.trim()}>
        {busy ? "Sending…" : "Send invite"}
      </button>
      <p className={error ? styles.railError : styles.railHint} role="status">
        {error ??
          note ??
          (full
            ? "No seats left — upgrade to invite more"
            : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left · they'll register and land here`)}
      </p>
    </form>
  );
}
