"use client";

import { useState, useEffect } from "react";
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
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const el = footer;

    function update() {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      setBottomOffset(visible);
    }

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function handleCompare() {
    if (!selected) return;
    router.push(`/compare/${currentSlug}-vs-${selected}`);
  }

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const slug = e.target.value;
    setSelected(slug);
    if (slug && window.innerWidth < 1024) {
      router.push(`/compare/${currentSlug}-vs-${slug}`);
    }
  }

  return (
    <div className={styles.compareBar} data-compare-bar style={{ bottom: bottomOffset }}>
      <div className={styles.compareBarInner}>
        <span className={styles.compareBarName}>{tripName}</span>
        <div className={styles.compareBarRight}>
          <select
            value={selected}
            onChange={handleSelect}
            className={styles.compareSelect}
          >
            <option value="" disabled>Compare…</option>
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
