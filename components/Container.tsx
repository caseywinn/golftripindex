import styles from "../styles/layout.module.css";

export default function Container({ children }: { children: React.ReactNode }) {
  return <main className={styles.container}>{children}</main>;
}
