"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "@/styles/tripDetail.module.css";
import type { TripPhoto } from "@/lib/clubTrips";

export default function TripPhotos({
  slug,
  tripId,
  initialPhotos,
  canEdit,
}: {
  slug: string;
  tripId: string;
  initialPhotos: TripPhoto[];
  canEdit: boolean;
}) {
  const [photos, setPhotos] = useState<TripPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const count = photos.length;

  // Lightbox keyboard nav + scroll lock while open.
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowRight") setLightbox((i) => (i === null ? i : (i + 1) % count));
      else if (e.key === "ArrowLeft") setLightbox((i) => (i === null ? i : (i - 1 + count) % count));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [lightbox, count]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    try {
      const res = await fetch(`/api/clubs/${encodeURIComponent(slug)}/trips/${tripId}/photos`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok) setPhotos((prev) => [...prev, ...(data.photos ?? [])]);
      else setError(data.error || "Could not upload.");
    } catch {
      setError("Could not upload. Try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/clubs/${encodeURIComponent(slug)}/trips/${tripId}/photos/${id}`, {
        method: "DELETE",
      });
      if (res.ok) setPhotos((prev) => prev.filter((p) => p.id !== id));
      else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not delete.");
      }
    } catch {
      setError("Could not delete. Try again.");
    }
  }

  return (
    <div>
      {count === 0 && !canEdit && <p className={styles.sectionEmpty}>No photos yet.</p>}

      {count > 0 && (
        <div className={styles.photoGrid}>
          {photos.map((p, i) => (
            <div key={p.id} className={styles.photoCell}>
              <button
                type="button"
                className={styles.photoOpen}
                onClick={() => setLightbox(i)}
                aria-label={`Open photo ${i + 1} of ${count}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className={styles.photoImg} loading="lazy" />
              </button>
              {canEdit && (
                <button
                  className={styles.photoDel}
                  onClick={() => remove(p.id)}
                  aria-label="Delete photo"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className={styles.photoUploadRow}>
          <input
            ref={inputRef}
            id="trip-photo-input"
            className={styles.photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onPick}
            disabled={uploading}
          />
          <label htmlFor="trip-photo-input" className={styles.photoUploadBtn} aria-disabled={uploading}>
            {uploading ? "Uploading…" : count ? "Add more photos" : "Upload photos"}
          </label>
          <span className={styles.photoHint}>JPG, PNG, or WebP · up to 10 MB each</span>
        </div>
      )}

      {error && <p className={styles.sectionErr}>{error}</p>}

      {lightbox !== null && photos[lightbox] && createPortal(
        <div className={styles.lightbox} onClick={() => setLightbox(null)}>
          <button className={styles.lbClose} onClick={() => setLightbox(null)} aria-label="Close">×</button>
          {count > 1 && (
            <button
              className={`${styles.lbNav} ${styles.lbPrev}`}
              onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === null ? i : (i - 1 + count) % count)); }}
              aria-label="Previous photo"
            >
              ‹
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[lightbox].url}
            alt=""
            className={styles.lbImg}
            onClick={(e) => e.stopPropagation()}
          />
          {count > 1 && (
            <button
              className={`${styles.lbNav} ${styles.lbNext}`}
              onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === null ? i : (i + 1) % count)); }}
              aria-label="Next photo"
            >
              ›
            </button>
          )}
          <div className={styles.lbCount}>{lightbox + 1} / {count}</div>
        </div>,
        document.body
      )}
    </div>
  );
}
