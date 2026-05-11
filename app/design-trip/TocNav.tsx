"use client";
import { useEffect, useState } from "react";
import dt from "../../styles/designTrip.module.css";

const TOC = [
  { id: "verdict",     label: "Verdict" },
  { id: "courses",     label: "Courses" },
  { id: "experience",  label: "The Experience" },
  { id: "side-trips",  label: "Side Trips" },
  { id: "fit",         label: "Right for You?" },
  { id: "cost",        label: "Cost" },
  { id: "when",        label: "When to Go" },
  { id: "tee-times",   label: "Tee Times" },
  { id: "mistakes",    label: "Common Mistakes" },
  { id: "pack",        label: "Pack List" },
  { id: "itinerary",   label: "Itinerary" },
  { id: "stay",        label: "Stay & Eat" },
  { id: "plan",        label: "Plan This Trip" },
];

export default function TocNav() {
  const [activeId, setActiveId] = useState<string>("");

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

    TOC.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Page sections">
      <div className={dt.tocLabel}>On this page</div>
      <ul className={dt.tocList}>
        {TOC.map(({ id, label }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className={`${dt.tocItem} ${activeId === id ? dt.tocItemActive : ""}`}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
