import Link from "next/link";
import styles from "../styles/header.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* Left: Logo */}
        <Link href="/" className={styles.logoWrap} aria-label="GolfTripIndex home">
          {/* Replace with your real logo asset path */}
          <img
            src="/logo-gti.png"
            alt="GolfTripIndex"
            className={styles.logo}
          />
        </Link>

        {/* Center: Nav */}
        <nav className={styles.nav} aria-label="Primary">
          <Link href="/trips" className={styles.navLink}>
            TRIP RANKINGS
          </Link>
          <Link href="/courses" className={styles.navLink}>
            COURSE RANKINGS
          </Link>
          <Link href="/how-we-rank" className={styles.navLink}>
            THE FORMULA
          </Link>
          <Link href="/who-we-are" className={styles.navLink}>
            WHO WE ARE
          </Link>
        </nav>

        {/* Right: CTA */}
        <div className={styles.cta}>
          <a
            href="https://instagram.com/golftripindex"
            aria-label="Instagram"
            className={styles.icon}
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* Instagram icon */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm10 2H7a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3zm-5 3a5 5 0 110 10 5 5 0 010-10zm0 2a3 3 0 100 6 3 3 0 000-6zm5.2-.9a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
