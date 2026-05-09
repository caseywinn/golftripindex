"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "../styles/header.module.css";

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* Left: Logo */}
        <Link href="/" className={styles.logoWrap} aria-label="GolfTripIndex home">
          <img src="/logo-gti.png" alt="GolfTripIndex" className={styles.logo} />
        </Link>

        {/* Mobile: Hamburger */}
        <button
          type="button"
          className={styles.hamburger}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="primary-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.hamburgerBar} />
          <span className={styles.hamburgerBar} />
          <span className={styles.hamburgerBar} />
        </button>

        {/* Center: Nav (becomes overlay/drawer on mobile) */}
        <nav
          id="primary-nav"
          className={`${styles.nav} ${open ? styles.navOpen : ""}`}
          aria-label="Primary"
        >
          <Link href="/trips" className={styles.navLink} onClick={() => setOpen(false)}>
            TRIP RANKINGS
          </Link>
          <Link href="/courses" className={styles.navLink} onClick={() => setOpen(false)}>
            COURSE RANKINGS
          </Link>
          <Link href="/journeys" className={styles.navLink} onClick={() => setOpen(false)}>
            JOURNEYS
          </Link>
          <Link href="/how-we-rate" className={styles.navLink} onClick={() => setOpen(false)}>
            HOW WE RATE
          </Link>

          {/* Instagram moved to bottom of hamburger menu */}
          <a
            href="https://instagram.com/golftripindex"
            aria-label="Instagram"
            className={styles.menuInstagram}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuInstagramIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm10 2H7a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3zm-5 3a5 5 0 110 10 5 5 0 010-10zm0 2a3 3 0 100 6 3 3 0 000-6zm5.2-.9a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2z" />
              </svg>
            </span>
            Instagram
          </a>
        </nav>

        {/* Desktop: keep CTA wrapper in DOM if you want, but hide it on mobile via CSS */}
        <div className={styles.cta}>
          <a
            href="https://instagram.com/golftripindex"
            aria-label="Instagram"
            className={styles.icon}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm10 2H7a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3zm-5 3a5 5 0 110 10 5 5 0 010-10zm0 2a3 3 0 100 6 3 3 0 000-6zm5.2-.9a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
