"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/tripDetails.module.css";

type TripOption = { slug: string; name: string };

export default function CompareWidget({
  tripName,
  currentSlug,
  trips,
}: {
  tripName: string;
  currentSlug: string;
  trips: TripOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");

  function handleCompare() {
    if (!selected) return;
    router.push(`/compare/${currentSlug}-vs-${selected}`);
  }

  return (
    <div className={styles.compareBar}>
      <div className={styles.compareBarInner}>
        <span className={styles.compareBarName}>{tripName}</span>
        <div className={styles.compareBarRight}>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className={styles.compareSelect}
          >
            <option value="" disabled>Compare with…</option>
            {trips.map(t => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={handleCompare}
            disabled={!selected}
            className={`${styles.compareBtn} ${selected ? styles.compareBtnActive : ""}`}
          >
            Compare
          </button>
        </div>
      </div>
    </div>
  );
}
