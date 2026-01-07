import Link from "next/link";
import styles from "../styles/home.module.css";

export default function HomePage() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroMedia} aria-hidden="true" />

        <div className={styles.heroInner}>
          <div className={styles.heroContent}>
            <div className={styles.kicker}>A definitive ranking of</div>
            <div className={styles.kicker2}>the entire golf trip</div>
            <h1 className={styles.title}>experience</h1>
          </div>
        </div>

        <a href="#home-content" className={styles.scrollHint} aria-label="Scroll to content">
          <span className={styles.scrollIcon} aria-hidden="true">▾</span>
        </a>
      </section>

      <section className={styles.section} id="home-content">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Latest News</h2>
          <Link href="/news" className={styles.viewAll}>
            View All
          </Link>
        </div>

        <div className={styles.cardRow}>
          {/* Placeholder cards – swap for real content later */}
          {["Australia", "Royal Melbourne", "Lockhart Travel Club", "Sandbelt Guide"].map((t) => (
            <article key={t} className={styles.card} />
          ))}
        </div>
      </section>
    </>
  );
}
