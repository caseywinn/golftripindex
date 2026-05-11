"use client";
import dt from "../../styles/designTrip.module.css";

export type JumpSection = { id: string; label: string };

export default function JumpToSection({ sections }: { sections: JumpSection[] }) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
    e.target.value = "";
  }

  return (
    <div className={dt.jumpNav}>
      <select className={dt.jumpNavSelect} defaultValue="" onChange={handleChange}>
        <option value="" disabled>Jump to section</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}
