import Link from "next/link";
import styles from "../styles/home.module.css";
import { getLatestPublishedArticles } from "../lib/airtable";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GolfTripIndex | Ranking USA's Best Golf Trips",
  description: "An overall ranking of the best golf trips in America.",
};

export default async function HomePage() {
  const articles = await getLatestPublishedArticles(6);

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

        <a
          href="#home-content"
          className={styles.scrollHint}
          aria-label="Scroll to content"
        >
          <span className={styles.scrollIcon} aria-hidden="true">
            ▾
          </span>
        </a>
      </section>

      <section className={styles.section} id="home-content">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Latest News</h2>
          <Link href="/articles" className={styles.viewAll}>
            View All
          </Link>
        </div>

        <div className={styles.cardRow}>
          {articles.map((n) => {
            const href = `/articles/${n.slug}`;
            const img = `/images/articles/${n.slug}.jpg`;

            return (
              <article
                key={n.id}
                className={`${styles.card} ${styles.newsCard} whiteRoundedBox`}
              >
                <div className={styles.newsMedia} aria-hidden={!img}>
                  {img ? (
                    <Link href={href} className={styles.newsImageLink} aria-label={n.name}>
                      <img
                        className={styles.newsImg}
                        src={img}
                        alt=""
                        loading="lazy"
                      />
                    </Link>
                  ) : null}
                </div>

                <div className={styles.newsBody}>
                  <div className={styles.newsTitle}>
                    <Link href={href} className={styles.newsTitleLink}>
                      {n.name}
                    </Link>
                  </div>

                  {n.teaser ? <div className={styles.newsTeaser}>{n.teaser}</div> : null}

                  {(n.author || n.publishedOn) && (
                    <div className={styles.newsMeta}>
                      {n.author ? <span className={styles.newsAuthor}>{n.author}</span> : null}
                      {n.publishedOn ? (
                        <span className={styles.newsDate}>
                          {new Date(n.publishedOn).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}