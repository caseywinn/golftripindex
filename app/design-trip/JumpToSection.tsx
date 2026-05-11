"use client";
import { useState } from "react";
import dt from "../../styles/designTrip.module.css";

export type JumpSection = { id: string; label: string };

export default function JumpToSection({ sections }: { sections: JumpSection[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={dt.jumpNav}>
      <button className={dt.jumpNavBtn} onClick={() => setOpen(true)}>
        Jump to section
        <span className={dt.jumpNavChevron}>▼</span>
      </button>

      {open && (
        <div className={dt.jumpModalBackdrop} onClick={() => setOpen(false)}>
          <div
            className={dt.jumpModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={dt.jumpModalHandle} />
            <div className={dt.jumpModalHeader}>
              <span className={dt.jumpModalTitle}>Jump to section</span>
              <button className={dt.jumpModalClose} onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className={dt.jumpModalLinks}>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={dt.jumpNavLink}
                  onClick={() => setOpen(false)}
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
