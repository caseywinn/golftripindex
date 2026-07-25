"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/styles/bag.module.css";
import type { UserClub } from "@/lib/clubs";

const ROLE_LABEL: Record<UserClub["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export default function MyClubs({ clubs }: { clubs: UserClub[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [homeCourse, setHomeCourse] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (creating) return;
    if (!name.trim()) {
      setError("Give your club a name.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), homeCourse: homeCourse.trim() || null }),
      });
      const data = await res.json();
      if (res.ok && data.slug) {
        // Land on the new club's page — the creator is already its active owner.
        window.location.href = `/clubs/${data.slug}`;
      } else {
        setError(data.error || "Could not create the club.");
        setCreating(false);
      }
    } catch {
      setError("Could not create the club. Try again.");
      setCreating(false);
    }
  }

  return (
    <section className={styles.clubsSection}>
      <h2 className={styles.sectionTitle}>
        My Clubs
        {clubs.length > 0 && <span className={styles.sectionCount}>{clubs.length}</span>}
      </h2>

      <div className={styles.clubGrid}>
        {clubs.map((c) => (
          <Link key={c.slug} href={`/clubs/${c.slug}`} className={styles.clubCard}>
            <span className={styles.clubRolePill}>{ROLE_LABEL[c.role]}</span>
            <span className={styles.clubCardName}>{c.name}</span>
            <span className={styles.clubCardMeta}>{c.homeCourse ?? " "}</span>
            {c.tripState === "voting" ? (
              <span className={`${styles.clubStatus} ${styles.clubStatusVoting}`}>
                <span className={styles.clubStatusDot} aria-hidden="true" />
                Voting open
              </span>
            ) : c.tripState === "planning" ? (
              <span className={`${styles.clubStatus} ${styles.clubStatusPlanning}`}>
                <span className={styles.clubStatusDot} aria-hidden="true" />
                Next trip set
              </span>
            ) : null}
          </Link>
        ))}
        {!open && (
          <button className={styles.createTile} onClick={() => setOpen(true)}>
            <span className={styles.createTilePlus}>+</span>
            Create a club
          </button>
        )}
      </div>

      {clubs.length === 0 && !open && (
        <p className={styles.clubsEmpty}>
          You&rsquo;re not in a club yet. Start one to plan trips and vote as a group.
        </p>
      )}

      {open && (
        <div className={styles.createForm}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Club name</span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wolf Hollow Men's Club"
              maxLength={80}
              autoFocus
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Home course <span className={styles.optional}>Optional</span>
            </span>
            <input
              className={styles.input}
              value={homeCourse}
              onChange={(e) => setHomeCourse(e.target.value)}
              placeholder="e.g. Wolf Hollow — Farmington, PA"
              maxLength={120}
            />
          </label>
          {error && <span className={styles.fieldError}>{error}</span>}
          <div className={styles.createActions}>
            <button className={styles.saveBtn} onClick={create} disabled={creating}>
              {creating ? "Creating…" : "Create club"}
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => { setOpen(false); setError(""); }}
              disabled={creating}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
