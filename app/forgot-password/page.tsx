"use client";

import { Suspense, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../../styles/auth.module.css";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  // Carried over from the login form so nobody retypes an address they just typed.
  const prefillEmail = searchParams.get("email") ?? "";
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const email = (e.currentTarget.elements.namedItem("email") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // The route answers the same whether or not the address has an account,
        // so this confirmation is deliberately non-committal about that.
        setSent(true);
      } else {
        setError(data.error ?? "Could not send the reset link. Try again.");
      }
    } catch {
      setError("Could not send the reset link. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Forgot password</h1>

        {sent ? (
          <>
            <p className={styles.subtitle}>Check your inbox</p>
            <p className={styles.notice}>
              If that address has a Golf Trip Index account, a reset link is on its way. It
              expires in an hour and works once.
            </p>
            <p className={styles.footer}>
              <Link href="/login" className={styles.footerLink}>
                Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className={styles.subtitle}>We&apos;ll email you a reset link</p>

            <form className={styles.form} onSubmit={handleSubmit}>
              {error && <p className={styles.error}>{error}</p>}

              <label className={styles.label}>
                Email
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  defaultValue={prefillEmail}
                  className={styles.input}
                  autoFocus
                />
              </label>

              <button type="submit" disabled={loading} className={styles.button}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className={styles.footer}>
              Remembered it?{" "}
              <Link href="/login" className={styles.footerLink}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
