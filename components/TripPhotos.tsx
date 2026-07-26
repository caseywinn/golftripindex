"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "@/styles/tripDetail.module.css";
import type { TripPhoto } from "@/lib/clubTrips";

type ApiJson = {
  error?: string;
  uploads?: { path: string; signedUrl: string }[];
  photos?: TripPhoto[];
};

/** Parse a JSON body, tolerating the plain-text bodies that edge errors return. */
async function readJson(res: Response): Promise<ApiJson | null> {
  try {
    return (await res.json()) as ApiJson;
  } catch {
    return null;
  }
}

/** PUT one file to its signed Supabase URL. The token is in the URL; no headers to add. */
async function putObject(signedUrl: string, file: File): Promise<boolean> {
  try {
    const res = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    return res.ok;
  } catch {
    return false;
  }
}

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
  const [progress, setProgress] = useState("");
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

  /**
   * Upload in three steps: ask the server for one signed URL per file, PUT the
   * bytes straight to Supabase Storage, then tell the server what landed.
   *
   * The photos deliberately never pass through our own API. A Vercel function
   * rejects a request body over ~4.5 MB at the edge, so the old single multipart
   * POST failed on any batch of two or three phone photos — and failed with a
   * plain-text 413 that res.json() choked on, which is why every error read
   * "Could not upload. Try again." regardless of cause.
   */
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    const files = Array.from(picked);
    setUploading(true);
    setError("");
    setProgress("");
    try {
      const base = `/api/clubs/${encodeURIComponent(slug)}/trips/${tripId}/photos`;

      const signRes = await fetch(`${base}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        }),
      });
      const signData = await readJson(signRes);
      if (!signRes.ok) {
        setError(signData?.error || "Could not start the upload. Try again.");
        return;
      }

      const uploads = signData?.uploads ?? [];
      const done: string[] = [];
      const failed: string[] = [];
      for (let i = 0; i < uploads.length; i++) {
        setProgress(`Uploading ${i + 1} of ${uploads.length}…`);
        const ok = await putObject(uploads[i].signedUrl, files[i]);
        if (ok) done.push(uploads[i].path);
        else failed.push(files[i].name);
      }

      // Record whatever made it, so one bad file doesn't discard the rest.
      if (done.length > 0) {
        setProgress("Saving…");
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: done }),
        });
        const data = await readJson(res);
        if (res.ok) setPhotos((prev) => [...prev, ...(data?.photos ?? [])]);
        else {
          setError(data?.error || "Could not save the photos. Try again.");
          return;
        }
      }

      if (failed.length > 0) {
        setError(
          failed.length === 1
            ? `"${failed[0]}" didn't upload. Try again.`
            : `${failed.length} photos didn't upload. Try again.`
        );
      }
    } catch {
      setError("Could not upload. Check your connection and try again.");
    } finally {
      setUploading(false);
      setProgress("");
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
            {uploading ? progress || "Uploading…" : count ? "Add more photos" : "Upload photos"}
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
