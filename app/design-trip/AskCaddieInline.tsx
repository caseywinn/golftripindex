"use client";
import dt from "../../styles/designTrip.module.css";

export default function AskCaddieInline() {
  return (
    <button
      className={dt.askCaddieInline}
      onClick={() => window.dispatchEvent(new CustomEvent("open-caddie"))}
    >
      <img
        src="/gti-avatar-thumb.png"
        alt=""
        aria-hidden="true"
        className={dt.askCaddieAvatar}
      />
      <span className={dt.askCaddieInlineText}>
        <span className={dt.askCaddieInlineLabel}>Have a question about this trip?</span>
        <span className={dt.askCaddieInlineSub}>Ask the GTI Caddie</span>
      </span>
      <span className={dt.askCaddieInlineArrow}>→</span>
    </button>
  );
}
