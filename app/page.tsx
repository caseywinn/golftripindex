import Link from "next/link";
import styles from "../styles/home.module.css";
import { getLatestPublishedArticles, getPublishedTrips } from "../lib/airtable";
import { formatPublishedDate } from "../lib/formatters";
import type { Metadata } from "next";
import { SITE_URL } from "../lib/seo";
import EmailSignup from "@/components/EmailSignup";
import HeroEmailForm from "@/components/HeroEmailForm";
import ShareButton from "@/components/ShareButton";
import SaveButton from "@/components/SaveButton";

export const revalidate = 604800; // regenerate once per week so the featured trip rotates automatically

export const metadata: Metadata = {
  title: "Golf Trip Index | Ranking USA's Best Golf Trips",
  description: "An overall ranking of the best golf trips in America.",
  alternates: { canonical: `${SITE_URL}/` },
};

function intScore(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return String(Math.round(Number(n)));
}

function overallScore(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(1);
}

export default async function HomePage() {
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
      <section className={styles.hero}>
        <div className={styles.heroMedia} aria-hidden="true" />
        <div className={styles.heroInner}>
          <p className={styles.heroLabel}>Golf Trip Index</p>
          <h1 className={styles.heroTitle}>
            A definitive ranking of America's best golf trips
          </h1>
          <p className={styles.heroSub}>
            Rated on courses, lodging, food, cost, and vibe.
          </p>
          <div className={styles.heroActions}>
            <Link href="/trips" className={styles.heroCta}>
              Explore Rankings
            </Link>
            <HeroEmailForm />
          </div>
        </div>
      </section>

      {/* ── FEATURED TRIP ── */}
      {featured && (
        <div className={styles.ftWrap}>
          <div className={styles.ftCard}>
            <div className={styles.ftImageWrap}>
              <Link
                href={`/trips/${featured.slug}`}
                className={styles.ftImage}
                style={{ backgroundImage: `url(/images/trips/${featured.slug}.jpg)` }}
                aria-label={featured.name}
              >
                {featured.currentRanking && (
                  <div className={styles.ftRankBadge}>
                    #{featured.currentRanking}
                  </div>
                )}
              </Link>
              <ShareButton itemType="trip" itemId={featured.slug} itemName={featured.name} variant="dark" corner small />
            </div>

            <div className={styles.ftBody}>
              <div className={styles.ftEyebrowRow}>
                <p className={styles.ftEyebrow}>Trip of the Week</p>
                <SaveButton itemType="trip" itemId={featured.slug} />
              </div>

              <h2 className={styles.ftName}>
                <Link href={`/trips/${featured.slug}`} className={styles.ftNameLink}>
                  {featured.name}
                  {featured.secondaryName && (
                    <span className={styles.ftSecondary}> + {featured.secondaryName}</span>
                  )}
                </Link>
              </h2>

              <div className={styles.ftScoreRow}>
                <div className={styles.ftScore}>
                  <span className={styles.ftScoreNum}>{intScore(featured.golfRating)}</span>
                  <span className={styles.ftScoreLabel}>Golf</span>
                </div>
                <div className={styles.ftScore}>
                  <span className={styles.ftScoreNum}>{intScore(featured.lodgingRating)}</span>
                  <span className={styles.ftScoreLabel}>Lodging</span>
                </div>
                <div className={styles.ftScore}>
                  <span className={styles.ftScoreNum}>{intScore(featured.foodRating)}</span>
                  <span className={styles.ftScoreLabel}>Food</span>
                </div>
                <div className={styles.ftScore}>
                  <span className={styles.ftScoreNum}>{intScore(featured.vibeRating)}</span>
                  <span className={styles.ftScoreLabel}>Vibe</span>
                </div>
                <div className={styles.ftOverallScore}>
                  <span className={styles.ftOverallNum}>{overallScore(featured.overallRating)}</span>
                  <span className={styles.ftOverallLabel}>Overall</span>
                </div>
              </div>

              {featured.overview && (
                <p className={styles.ftOverview}>{featured.overview}</p>
              )}

              <Link href={`/trips/${featured.slug}`} className={styles.ftReadMore}>
                Read the full review →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── ARTICLES ── */}
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
                  {n.slug && <ShareButton itemType="article" itemId={n.slug} itemName={n.name} variant="dark" corner small />}
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

      <EmailSignup
        heading="Get the next ranking first."
        subtext="New trips, journeys, and stories from GTI, straight to your inbox."
        buttonText="Sign up"
      />
    </>
  );
}
