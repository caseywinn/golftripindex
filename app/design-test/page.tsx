import Link from "next/link";
import styles from "../../styles/home.module.css";
import dt from "../../styles/designTest.module.css";
import { getLatestPublishedArticles, getPublishedTrips } from "../../lib/airtable";
import { formatPublishedDate } from "../../lib/formatters";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design Test | Golf Trip Index",
  robots: { index: false, follow: false },
};

function intScore(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return String(Math.round(Number(n)));
}

function overallScore(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(1);
}

export default async function DesignTestPage() {
  const [articles, allTrips] = await Promise.all([
    getLatestPublishedArticles(6),
    getPublishedTrips(),
  ]);

  // Picks a different trip each week in a non-sequential order that looks random,
  // but is consistent for all visitors throughout the week.
  const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const hash = Math.imul(weekIndex, 2654435761) >>> 0;
  const featured = allTrips[hash % allTrips.length];

  return (
    <>
      {/* ── HERO ── */}
      <section className={dt.hero}>
        <div className={dt.heroMedia} aria-hidden="true" />
        <div className={dt.heroInner}>
          <p className={dt.heroLabel}>Golf Trip Index</p>
          <h1 className={dt.heroTitle}>
            A definitive ranking of America's best golf trips
          </h1>
          <p className={dt.heroSub}>
            Rated on courses, lodging, food, cost, and vibe.
          </p>
          <Link href="/trips" className={dt.heroCta}>
            Explore Rankings
          </Link>
        </div>
      </section>

      {/* ── FEATURED TRIP ── */}
      {featured && (
        <div className={dt.ftWrap}>
          <div className={dt.ftCard}>
            <Link
              href={`/trips/${featured.slug}`}
              className={dt.ftImage}
              style={{ backgroundImage: `url(/images/trips/${featured.slug}.jpg)` }}
              aria-label={featured.name}
            >
              {featured.currentRanking && (
                <div className={dt.ftRankBadge}>
                  #{featured.currentRanking} Ranked
                </div>
              )}
            </Link>

            <div className={dt.ftBody}>
              <p className={dt.ftEyebrow}>Trip of the Week</p>

              <h2 className={dt.ftName}>
                <Link href={`/trips/${featured.slug}`} className={dt.ftNameLink}>
                  {featured.name}
                  {featured.secondaryName && (
                    <span className={dt.ftSecondary}> + {featured.secondaryName}</span>
                  )}
                </Link>
              </h2>

              {featured.state && (
                <div className={dt.ftMeta}>
                  <span className={dt.ftStateBadge}>{featured.state}</span>
                </div>
              )}

              <div className={dt.ftScoreRow}>
                <div className={dt.ftScore}>
                  <span className={dt.ftScoreNum}>{intScore(featured.golfRating)}</span>
                  <span className={dt.ftScoreLabel}>Golf</span>
                </div>
                <div className={dt.ftScore}>
                  <span className={dt.ftScoreNum}>{intScore(featured.lodgingRating)}</span>
                  <span className={dt.ftScoreLabel}>Lodging</span>
                </div>
                <div className={dt.ftScore}>
                  <span className={dt.ftScoreNum}>{intScore(featured.foodRating)}</span>
                  <span className={dt.ftScoreLabel}>Food</span>
                </div>
                <div className={dt.ftScore}>
                  <span className={dt.ftScoreNum}>{intScore(featured.vibeRating)}</span>
                  <span className={dt.ftScoreLabel}>Vibe</span>
                </div>
                <div className={dt.ftOverallScore}>
                  <span className={dt.ftOverallNum}>{overallScore(featured.overallRating)}</span>
                  <span className={dt.ftOverallLabel}>Overall</span>
                </div>
              </div>

              {featured.overview && (
                <p className={dt.ftOverview}>{featured.overview}</p>
              )}

              <Link href={`/trips/${featured.slug}`} className={dt.ftReadMore}>
                Read the full review →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── ARTICLES (unchanged) ── */}
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

                  {n.teaser ? (
                    <div className={styles.newsTeaser}>{n.teaser}</div>
                  ) : null}

                  {(n.author || n.publishedOn) && (
                    <div className={styles.newsMeta}>
                      {n.author ? (
                        <span className={styles.newsAuthor}>{n.author}</span>
                      ) : null}
                      {n.publishedOn ? (
                        <span className={styles.newsDate}>
                          {formatPublishedDate(n.publishedOn)}
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
