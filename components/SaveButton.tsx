"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUserItems } from "@/lib/userItems";
import styles from "@/styles/saveButton.module.css";

type ItemType = "trip" | "journey" | "course";

type Props = {
  itemType: ItemType;
  itemId: string;
  variant?: "light" | "dark";
};

export default function SaveButton({ itemType, itemId, variant = "light" }: Props) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { getStatus, setStatus } = useUserItems();

  const loginHref = `/register?callbackUrl=${encodeURIComponent(pathname)}`;
  const current = getStatus(itemType, itemId);
  const darkCls = variant === "dark" ? styles.dark : "";

  function handleClick(status: "wishlist" | "played") {
    setStatus(itemType, itemId, current === status ? null : status);
  }

  if (!session) {
    return (
      <div className={styles.wrap}>
        <Link href={loginHref} className={`${styles.btn} ${darkCls}`}>
          <BookmarkIcon active={false} />
          Wishlist
        </Link>
        <Link href={loginHref} className={`${styles.btn} ${styles.btnPlayedBase} ${darkCls}`}>
          <CheckIcon active={false} />
          Played
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.btn} ${darkCls} ${current === "wishlist" ? styles.btnWishlistActive : ""}`}
        onClick={() => handleClick("wishlist")}
        aria-pressed={current === "wishlist"}
      >
        <BookmarkIcon active={current === "wishlist"} />
        Wishlist
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPlayedBase} ${darkCls} ${current === "played" ? styles.btnPlayedActive : ""}`}
        onClick={() => handleClick("played")}
        aria-pressed={current === "played"}
      >
        <CheckIcon active={current === "played"} />
        Played
      </button>
    </div>
  );
}

function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

function CheckIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "3" : "2"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
