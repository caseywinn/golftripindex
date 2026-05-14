"use client";
import { useState } from "react";
import dt from "../../styles/designTrip.module.css";

export type ItineraryDay = {
  day: string;
  schedule: string;
  note: string;
};

export default function ItineraryToggle({
  minItinerary,
  maxItinerary,
  footnote,
  defaultTab,
}: {
  minItinerary: ItineraryDay[];
  maxItinerary: ItineraryDay[];
  footnote: string;
  defaultTab?: "min" | "max";
}) {
  const defaultActive = defaultTab ?? (minItinerary.length === 4 ? "min" : maxItinerary.length === 4 ? "max" : "min");
  const [active, setActive] = useState<"min" | "max">(defaultActive);
  const days = active === "min" ? minItinerary : maxItinerary;

  return (
    <>
      <div className={dt.itineraryToggle}>
        <button
          className={`${dt.itineraryToggleBtn} ${active === "min" ? dt.itineraryToggleBtnActive : ""}`}
          onClick={() => setActive("min")}
        >
          {minItinerary.length} days
        </button>
        <button
          className={`${dt.itineraryToggleBtn} ${active === "max" ? dt.itineraryToggleBtnActive : ""}`}
          onClick={() => setActive("max")}
        >
          {maxItinerary.length} days
        </button>
      </div>

      <ol className={dt.itineraryList}>
        {days.map((day) => (
          <li key={day.day} className={dt.itineraryItem}>
            <div className={dt.itineraryDot}>
              <div className={dt.itineraryDotCircle} />
              <div className={dt.itineraryDayLabel}>{day.day}</div>
            </div>
            <div className={dt.itineraryContent}>
              <div className={dt.itinerarySchedule}>{day.schedule}</div>
              <div className={dt.itineraryNote}>{day.note}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className={dt.itineraryFootnote}>{footnote}</div>
    </>
  );
}
