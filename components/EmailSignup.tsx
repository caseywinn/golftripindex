"use client";

import { useState } from "react";
import styles from "@/styles/emailSignup.module.css";

type Variant = "block" | "compact";

export default function EmailSignup({
  heading,
  subtext,
  buttonText = "Sign up",
  variant = "block",
  extraBottomPadding = 0,
}: {
  heading: string;
  subtext?: string;
  buttonText?: string;
  variant?: Variant;
  extraBottomPadding?: number;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (variant === "compact") {
    return (
      <div className={styles.compact}>
        <span className={styles.compactLabel}>{heading}</span>
        {status === "success" ? (
          <span className={styles.compactSuccess}>You&apos;re on the list.</span>
        ) : (
          <form className={styles.compactForm} onSubmit={handleSubmit}>
            <input
              className={styles.compactInput}
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              aria-label="Email address"
            />
            <button className={styles.compactButton} type="submit" disabled={status === "loading"}>
              {status === "loading" ? "…" : "→"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className={styles.block} style={extraBottomPadding ? { paddingBottom: 48 + extraBottomPadding } : undefined}>
      <p className={styles.heading}>{heading}</p>
      {subtext && <p className={styles.subtext}>{subtext}</p>}
      {status === "success" ? (
        <p className={styles.success}>You&apos;re on the list. We&apos;ll be in touch.</p>
      ) : (
        <>
          <form className={styles.form} onSubmit={handleSubmit}>
            <input
              className={styles.input}
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              aria-label="Email address"
            />
            <button className={styles.button} type="submit" disabled={status === "loading"}>
              {status === "loading" ? "…" : buttonText}
            </button>
          </form>
          {status === "error" && (
            <p className={styles.error}>Something went wrong. Please try again.</p>
          )}
        </>
      )}
    </div>
  );
}
