"use client";

import { Suspense, useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../../styles/auth.module.css";

function useSafeCallbackUrl() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("callbackUrl") ?? "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useSafeCallbackUrl();
  // Carried over from a club invite, or from /register when the address already
  // has an account.
  const prefillEmail = searchParams.get("email") ?? "";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Tracked only so "Forgot password?" can carry whatever address is already in
  // the field — the form itself still reads from the DOM on submit.
  const [email, setEmail] = useState(prefillEmail);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>Welcome back</p>

        <button
          type="button"
          className={styles.googleButton}
          onClick={() => signIn("google", { callbackUrl })}
        >
          <svg className={styles.googleIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className={styles.divider}><span>or</span></div>

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
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
            />
          </label>

          <label className={styles.label}>
            Password
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className={styles.input}
            />
          </label>

          <button type="submit" disabled={loading} className={styles.button}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className={styles.footer}>
          No account?{" "}
          <Link href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`} className={styles.footerLink}>
            Create one
          </Link>
        </p>

        <p className={styles.footerAlt}>
          <Link
            href={email ? `/forgot-password?email=${encodeURIComponent(email)}` : "/forgot-password"}
            className={styles.footerLink}
          >
            Forgot password?
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
