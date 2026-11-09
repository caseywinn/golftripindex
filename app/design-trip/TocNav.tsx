"use client";
import { useEffect, useMemo, useState } from "react";
import dt from "../../styles/designTrip.module.css";

const TOC = [
  { id: "verdict",     label: "Verdict" },
  { id: "courses",     label: "Courses" },
  { id: "experience",  label: "The Experience" },
  { id: "side-trips",  label: "Side Trips" },
  { id: "fit",         label: "Right for You?" },
  { id: "when",        label: "When to Go" },
  { id: "cost",        label: "Cost" },
  { id: "tee-times",   label: "Tee Times" },
  { id: "mistakes",    label: "Common Mistakes" },
  { id: "pack",        label: "Pack List" },
  { id: "itinerary",   label: "Itinerary" },
  { id: "stay",        label: "Stay & Eat" },
];

// sectionIds: when given, only those entries render (pages that hide or omit sections)
export default function TocNav({ sectionIds }: { sectionIds?: string[] } = {}) {
  const [activeId, setActiveId] = useState<string>("");
  const idsKey = sectionIds?.join(",");
  const items = useMemo(
    () => (idsKey === undefined ? TOC : TOC.filter(({ id }) => idsKey.split(",").includes(id))),
    [idsKey]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: 0 }
    );

    items.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [items]);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <nav aria-label="Page sections">
      <div className={dt.tocLabel}>On this page</div>
      <ul className={dt.tocList}>
        {items.map(({ id, label }) => (
          <li key={id}>
            <button
              onClick={() => scrollTo(id)}
              className={`${dt.tocItem} ${activeId === id ? dt.tocItemActive : ""}`}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
