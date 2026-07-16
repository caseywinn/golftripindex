"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "@/styles/clubs.module.css";

type Action = "promote" | "demote" | "suspend" | "reactivate" | "remove" | "revoke" | "resend";

export type MemberMenuProps = {
  slug: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "invited" | "active" | "suspended";
  /** The viewer's own role — only an owner may change roles or touch an admin. */
  viewerRole: "owner" | "admin";
  /** True when this row is the viewer themselves. */
  isSelf: boolean;
};

/**
 * Overflow menu for a roster row. The rail is 300px wide, so inline
 * Manage/Resend/Revoke buttons don't fit; this keeps the row to one affordance
 * and works on touch (unlike hover-reveal).
 */
export default function ClubMemberMenu(props: MemberMenuProps) {
  const { slug, email, role, status, viewerRole, isSelf } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fixed viewport coords for the portalled popover. The rail is a scroll
  // container (overflow-y:auto), so an in-flow absolute popover would be clipped
  // — badly for rows near the bottom. Portal to <body> and position from the
  // button's rect instead.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // A fixed popover doesn't follow its anchor, so close rather than let it
    // drift. `true` catches scrolls inside the rail, not just the window.
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // The owner row and your own row have no actions — the server rejects both,
  // so offering them would just be a button that always errors.
  const ownerRow = role === "owner";
  const adminLocked = role === "admin" && viewerRole !== "owner";
  if (ownerRow || isSelf || adminLocked) return null;

  const items: { label: string; action: Action; danger?: boolean }[] = [];
  if (status === "invited") {
    items.push({ label: "Resend invite", action: "resend" });
    items.push({ label: "Revoke invite", action: "revoke", danger: true });
  } else {
    if (viewerRole === "owner") {
      items.push(
        role === "member"
          ? { label: "Make admin", action: "promote" }
          : { label: "Remove admin", action: "demote" }
      );
    }
    if (status === "active") items.push({ label: "Suspend", action: "suspend" });
    if (status === "suspended") items.push({ label: "Reactivate", action: "reactivate" });
    items.push({ label: "Remove from club", action: "remove", danger: true });
  }
  if (!items.length) return null;

  async function run(action: Action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Resending reuses the invite endpoint, which already returns
      // outcome:"resent" for an unclaimed row.
      const url =
        action === "resend"
          ? `/api/clubs/${encodeURIComponent(slug)}/invite`
          : `/api/clubs/${encodeURIComponent(slug)}/members`;
      const payload = action === "resend" ? { email } : { email, action };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "That didn't work.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("That didn't work. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    if (!open) place();
    setOpen((o) => !o);
  }

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        ref={btnRef}
        className={styles.menuBtn}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Manage ${email}`}
        disabled={busy}
      >
        ···
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className={styles.menuPop}
            role="menu"
            style={{ top: pos.top, right: pos.right }}
          >
            {items.map((it) => (
              <button
                key={it.action}
                role="menuitem"
                className={it.danger ? styles.menuItemDanger : styles.menuItem}
                onClick={() => run(it.action)}
                disabled={busy}
              >
                {it.label}
              </button>
            ))}
            {error && <p className={styles.menuError}>{error}</p>}
          </div>,
          document.body
        )}
    </div>
  );
}
