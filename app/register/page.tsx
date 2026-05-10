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

function RegisterForm() {
  const router = useRouter();
  const callbackUrl = useSafeCallbackUrl();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Registration failed. Please try again.");
      setLoading(false);
      return;
    }

    await signIn("credentials", { email, password, redirect: false });
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create account</h1>
        <p className={styles.subtitle}>Start planning your next trip</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <p className={styles.error}>{error}</p>}

          <label className={styles.label}>
            Name
            <input
              type="text"
              name="name"
              required
              autoComplete="name"
              className={styles.input}
            />
          </label>

          <label className={styles.label}>
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className={styles.input}
            />
          </label>

          <label className={styles.label}>
            Password
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={styles.input}
            />
          </label>

          <button type="submit" disabled={loading} className={styles.button}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className={styles.footer}>
          Already have an account?{" "}
          <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className={styles.footerLink}>
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
