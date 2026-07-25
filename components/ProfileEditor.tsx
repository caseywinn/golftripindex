"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import styles from "@/styles/bag.module.css";
import type { UserProfile } from "@/lib/users";

type TripOpt = { slug: string; name: string };

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return email[0]?.toUpperCase() ?? "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function ProfileEditor({
  profile,
  trips,
}: {
  profile: UserProfile;
  trips: TripOpt[];
}) {
  const router = useRouter();
  const { update } = useSession();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [handicap, setHandicap] = useState(profile.handicap ?? "");
  const [favoriteTrip, setFavoriteTrip] = useState(profile.favoriteTrip ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Favorite-trip typeahead: suggestions appear only once the golfer has typed
  // something (never the whole catalog on focus), and never a lone suggestion
  // that just echoes what's already typed.
  const [favOpen, setFavOpen] = useState(false);
  const favSuggest = useMemo(() => {
    const q = favoriteTrip.trim().toLowerCase();
    if (!q) return [];
    const matches = trips.filter((t) => t.name.toLowerCase().includes(q));
    if (matches.length === 1 && matches[0].name.toLowerCase() === q) return [];
    return matches.slice(0, 6);
  }, [favoriteTrip, trips]);

  // Favorite trip is free text (with autocomplete) — it may be a catalog trip or
  // anything the golfer types. Link the stat tile only when the text matches a
  // real trip name; otherwise it's just a label.
  const favText = profile.favoriteTrip ?? null;
  const favSlug = favText
    ? trips.find((t) => t.name.toLowerCase() === favText.toLowerCase())?.slug ?? null
    : null;

  function startEdit() {
    setName(profile.name);
    setHandicap(profile.handicap ?? "");
    setFavoriteTrip(profile.favoriteTrip ?? "");
    setError("");
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    if (!name.trim()) {
      setError("Add a handle so your buddies know who you are.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          handicap: handicap.trim() || null,
          favoriteTrip: favoriteTrip || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Push the new Handle into the session so the header updates without a
        // re-login (auth.ts handles the 'update' trigger), then re-render this
        // server component against the freshly saved DB values.
        await update({ name: data.name });
        setEditing(false);
        router.refresh();
      } else {
        setError(data.error || "Could not save your profile.");
      }
    } catch {
      setError("Could not save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.profileHero}>
      <div className={styles.heroMain}>
        <div className={styles.avatarLg} aria-hidden="true">
          {initials(profile.name, profile.email)}
        </div>
        <div className={styles.heroIdent}>
          <div className={styles.heroName}>{profile.name || "Your handle"}</div>
          <div className={styles.heroEmail}>{profile.email}</div>
        </div>
        {!editing && (
          <button className={styles.editBtn} onClick={startEdit}>Edit</button>
        )}
      </div>

      {editing ? (
        <div className={styles.editForm}>
          <div className={styles.profileGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Handle</span>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Casey Winn or cwinn04"
                maxLength={80}
                autoFocus
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Handicap <span className={styles.optional}>Optional</span>
              </span>
              <input
                className={styles.input}
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                placeholder="e.g. 12.4 or +1.3"
                maxLength={12}
              />
            </label>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <span className={styles.fieldLabel}>
                Favorite trip <span className={styles.optional}>Optional</span>
              </span>
              <div className={styles.autoWrap}>
                <input
                  aria-label="Favorite trip"
                  className={styles.input}
                  value={favoriteTrip}
                  onChange={(e) => { setFavoriteTrip(e.target.value); setFavOpen(true); }}
                  onFocus={() => setFavOpen(true)}
                  onBlur={() => setFavOpen(false)}
                  placeholder="Start typing a trip — or enter your own"
                  maxLength={120}
                  autoComplete="off"
                />
                {favOpen && favSuggest.length > 0 && (
                  <ul className={styles.autoList}>
                    {favSuggest.map((t) => (
                      <li key={t.slug}>
                        <button
                          type="button"
                          className={styles.autoItem}
                          // preventDefault keeps the input focused so the click
                          // registers before the blur closes the list.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setFavoriteTrip(t.name); setFavOpen(false); }}
                        >
                          {t.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          {error && <span className={styles.fieldError}>{error}</span>}
          <div className={styles.editActions}>
            <button className={styles.saveBtn} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => { setEditing(false); setError(""); }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.statTiles}>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Handicap</span>
            <span className={styles.statValue}>{profile.handicap || "—"}</span>
          </div>
          {favText ? (
            favSlug ? (
              <Link href={`/trips/${favSlug}`} className={`${styles.statTile} ${styles.statTileLink}`}>
                <span className={styles.statLabel}>Favorite trip</span>
                <span className={styles.statValue}>{favText}</span>
              </Link>
            ) : (
              <div className={styles.statTile}>
                <span className={styles.statLabel}>Favorite trip</span>
                <span className={styles.statValue}>{favText}</span>
              </div>
            )
          ) : (
            <div className={styles.statTile}>
              <span className={styles.statLabel}>Favorite trip</span>
              <span className={`${styles.statValue} ${styles.statValueEmpty}`}>Not set</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
