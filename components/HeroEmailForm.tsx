"use client";

import { useState } from "react";
import styles from "@/styles/home.module.css";

export default function HeroEmailForm() {
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

  if (status === "success") {
    return <span className={styles.heroFormSuccess}>You&apos;re on the list.</span>;
  }

  return (
    <form className={styles.heroForm} onSubmit={handleSubmit}>
      <input
        className={styles.heroFormInput}
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        aria-label="Email address"
      />
      <button className={styles.heroFormButton} type="submit" disabled={status === "loading"}>
        {status === "loading" ? "…" : "→"}
      </button>
    </form>
  );
}
