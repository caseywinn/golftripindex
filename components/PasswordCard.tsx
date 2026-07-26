"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/styles/bag.module.css";

/**
 * Change-password card on My Bag.
 *
 * Only rendered with hasPassword=true for accounts that actually have one.
 * Google-only golfers get the explanatory variant instead: there's no current
 * password to verify, so the form would be unanswerable — they set one through
 * the emailed link at /forgot-password, which proves control of the address.
 */
export default function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
  }

  function close() {
    reset();
    setOpen(false);
  }

  async function save() {
    if (saving) return;
    setError("");

    if (!current || !next) {
      setError("Fill in your current and new password.");
      return;
    }
    if (next.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Those two new passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        reset();
        setOpen(false);
        setSaved(true);
      } else {
        setError(data.error || "Could not change your password.");
      }
    } catch {
      setError("Could not change your password. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!hasPassword) {
    return (
      <section className={styles.securitySection}>
        <div className={styles.securityHead}>
          <h2 className={styles.sectionTitle}>Password</h2>
        </div>
        <p className={styles.securityNote}>
          You sign in with Google, so there&apos;s no password on this account.{" "}
          <Link href="/forgot-password" className={styles.securityLink}>
            Set one by email
          </Link>{" "}
          if you&apos;d like a second way in.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.securitySection}>
      <div className={styles.securityHead}>
        <h2 className={styles.sectionTitle}>Password</h2>
        {!open && (
          <button className={styles.editBtn} onClick={() => { setSaved(false); setOpen(true); }}>
            Change
          </button>
        )}
      </div>

      {saved && !open && (
        <p className={styles.securitySaved}>Password changed.</p>
      )}

      {open ? (
        <div className={styles.editForm}>
          <div className={styles.profileGrid}>
            {/* Full width so the two new-password boxes pair off on the row
                below — side-by-side "current" and "new" invites typing the
                wrong one into the wrong box. */}
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span className={styles.fieldLabel}>Current password</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoFocus
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>New password</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Confirm new password</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          </div>
          {error && <span className={styles.fieldError}>{error}</span>}
          <div className={styles.editActions}>
            <button className={styles.saveBtn} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Update password"}
            </button>
            <button className={styles.ghostBtn} onClick={close} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        !saved && (
          <p className={styles.securityNote}>
            At least 8 characters. You&apos;ll need your current one to change it —{" "}
            <Link href="/forgot-password" className={styles.securityLink}>
              forgot it?
            </Link>
          </p>
        )
      )}
    </section>
  );
}
