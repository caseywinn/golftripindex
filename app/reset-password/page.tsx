"use client";

import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../../styles/auth.module.css";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement).value;

    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not reset your password. Try again.");
        setLoading(false);
        return;
      }

      // Deliberately NOT signing them in here. Doing that would mean the reset
      // route handing the email back to whoever holds the token, and the token
      // alone is not supposed to be enough to learn whose account it opens.
      setDone(true);
      setLoading(false);
    } catch {
      setError("Could not reset your password. Try again.");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Reset password</h1>
          <p className={styles.subtitle}>This link is incomplete</p>
          <p className={styles.notice}>
            The reset link is missing its token — email clients sometimes clip long links. Ask
            for a fresh one and open it directly.
          </p>
          <p className={styles.footer}>
            <Link href="/forgot-password" className={styles.footerLink}>
              Request a new link
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Reset password</h1>

        {done ? (
          <>
            <p className={styles.subtitle}>Password updated</p>
            <p className={styles.notice}>
              Your new password is set. Sign in with it and you&apos;re back in your bag.
            </p>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonBlock}`}
              onClick={() => router.push("/login")}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            <p className={styles.subtitle}>Pick a new one</p>

            <form className={styles.form} onSubmit={handleSubmit}>
              {error && <p className={styles.error}>{error}</p>}

              <label className={styles.label}>
                New password
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={styles.input}
                  autoFocus
                />
              </label>

              <label className={styles.label}>
                Confirm new password
                <input
                  type="password"
                  name="confirm"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={styles.input}
                />
              </label>

              <button type="submit" disabled={loading} className={styles.button}>
                {loading ? "Saving…" : "Set new password"}
              </button>
            </form>

            <p className={styles.footer}>
              <Link href="/forgot-password" className={styles.footerLink}>
                Request a new link
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
