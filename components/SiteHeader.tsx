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
            2026 Trip Rankings
          </Link>
          <Link href="/courses" className={styles.navLink}>
            Consolidated Course Rankings
          </Link>
          <Link href="/how-we-rank" className={styles.navLink}>
            How We Rank
          </Link>
          <Link href="/who-we-are" className={styles.navLink}>
            Who We Are
          </Link>
        </nav>

        {/* Right: CTA */}
        <div className={styles.cta}>
          <Link href="/become-a-rater" className={styles.ctaLink}>
            Become a Rater
          </Link>
        </div>
      </div>
    </header>
  );
}
