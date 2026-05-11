"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "@/styles/shareButton.module.css";

type Props = {
  itemType: "trip" | "journey" | "article";
  itemId: string;
  itemName: string;
  variant?: "dark" | "light";
  corner?: boolean; // absolute top-right corner of a relative parent
  small?: boolean;
};

export default function ShareButton({ itemType, itemId, itemName, variant = "dark", corner = false, small = false }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "ratelimit">("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inWrap = triggerRef.current?.closest("[data-share-wrap]")?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inWrap && !inPopover) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const left = Math.min(rect.left, window.innerWidth - 304);
      setPopoverStyle({ top: rect.bottom + 8, left: Math.max(left, 8) });
    }
    setOpen((v) => !v);
    setStatus("idle");
  }

  async function handleSend() {
    if (!email) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: email, itemType, itemId, itemName, senderName }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("sent");
        setEmail("");
        setSenderName("");
      } else if (res.status === 429) {
        setStatus("ratelimit");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className={`${styles.wrap} ${corner ? styles.wrapCorner : ""}`} data-share-wrap="">
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${variant === "light" ? styles.triggerLight : ""} ${small ? styles.triggerSmall : ""}`}
        onClick={handleOpen}
        aria-label="Share via email"
      >
        <ShareIcon className={styles.triggerIcon} />
        Share
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className={styles.popover}
          style={popoverStyle}
          role="dialog"
          aria-label="Share via email"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={styles.popoverHeader}>
            <p className={styles.popoverTitle}>Share via Email</p>
            <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          {status === "sent" ? (
            <p className={`${styles.feedback} ${styles.success}`}>Sent! They&apos;ll get it shortly.</p>
          ) : (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="share-email">Recipient email</label>
                <input
                  id="share-email"
                  className={styles.input}
                  type="email"
                  placeholder="friend@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="share-name">Your name</label>
                <input
                  id="share-name"
                  className={styles.input}
                  type="text"
                  placeholder="Your name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                />
              </div>

              <button
                className={styles.sendBtn}
                onClick={handleSend}
                disabled={!email || !senderName || status === "sending"}
              >
                {status === "sending" ? "Sending..." : "Send"}
              </button>

              {status === "error" && (
                <p className={`${styles.feedback} ${styles.error}`}>Something went wrong. Try again.</p>
              )}
              {status === "ratelimit" && (
                <p className={`${styles.feedback} ${styles.error}`}>Too many shares. Try again later.</p>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
