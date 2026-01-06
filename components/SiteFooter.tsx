import styles from "../styles/footer.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div>© {new Date().getFullYear()} GolfTripIndex</div>
        <div className={styles.muted}>Independent rankings. Not affiliated with any publisher.</div>
      </div>
    </footer>
  );
}
