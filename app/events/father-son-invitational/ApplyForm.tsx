"use client";

import { useState, FormEvent } from "react";
import styles from "@/styles/event.module.css";

/**
 * Interest capture, not a booking flow. No payment, no venue or date picker,
 * no account — see the brief's non-goals. Submissions land in the Airtable
 * EventApplications table via /api/events/apply.
 */
export default function ApplyForm({ event }: { event: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;

    const form = e.currentTarget;
    const value = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;

    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/events/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: value("name"),
          email: value("email"),
          kidName: value("kidName"),
          kidAge: value("kidAge"),
          homeRegion: value("homeRegion"),
          notes: value("notes"),
          company: value("company"),
          event,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className={`${styles.formCard} whiteRoundedBox`}>
        <p className={styles.success}>Thanks — we&apos;ll be in touch as details firm up.</p>
        <p className={styles.successNote}>
          Nothing is booked and nothing is owed. When we have a host and dates, you&apos;ll hear
          from us before the trip is announced anywhere else.
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.formCard} whiteRoundedBox`}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label}>
          Your name
          <input className={styles.input} name="name" type="text" required maxLength={120} autoComplete="name" />
        </label>

        <label className={styles.label}>
          Email
          <input className={styles.input} name="email" type="email" required maxLength={200} autoComplete="email" />
        </label>

        <div className={styles.row}>
          <label className={styles.label}>
            Kid&apos;s name
            <input className={styles.input} name="kidName" type="text" required maxLength={120} />
          </label>
          <label className={styles.label}>
            Age
            <input className={styles.input} name="kidAge" type="number" inputMode="numeric" min={1} max={21} required />
          </label>
        </div>

        <label className={styles.label}>
          Home city or region
          <input className={styles.input} name="homeRegion" type="text" required maxLength={160} placeholder="e.g. Charlotte, NC" />
          <span className={styles.hint}>
            We&apos;re using this to work out where the demand is, which is part of how we&apos;ll pick
            the host.
          </span>
        </label>

        <label className={`${styles.label} ${styles.formFull}`}>
          Anything else you&apos;d like us to know <span className={styles.optional}>(optional)</span>
          <textarea className={styles.textarea} name="notes" maxLength={2000} />
          <span className={styles.hint}>
            Bringing more than one kid, no clubs yet, a travel constraint — all useful.
          </span>
        </label>

        {/* Honeypot. Hidden from people, tempting to bots. */}
        <div className={`${styles.honeypot} ${styles.formFull}`} aria-hidden="true">
          <label>
            Company
            <input name="company" type="text" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <button
          className={`${styles.button} ${styles.formFull}`}
          type="submit"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Sending…" : "Send application"}
        </button>

        {status === "error" && <p className={`${styles.error} ${styles.formFull}`}>{error}</p>}
      </form>
    </div>
  );
}
