import Link from "next/link";
import styles from "../styles/footer.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        {/* Left */}
        <div className={styles.left}>
          © GOLFTRIPINDEX
        </div>

        {/* Center */}
        <div className={styles.center}>
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

        {/* Right */}
        <div className={styles.right}>
          <Link href="/terms">TERMS & CONDITIONS</Link>
          <span className={styles.sep}>/</span>
          <Link href="/privacy">PRIVACY POLICY</Link>
        </div>
      </div>
    </footer>
  );
}
