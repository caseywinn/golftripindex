import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getArticlesForIndex } from "../../lib/airtable";
import { formatPublishedDate } from "../../lib/formatters";
import styles from "../../styles/articles.module.css";
import { SITE_URL } from "../../lib/seo";
import ShareButton from "@/components/ShareButton";
import { JsonLd } from "@/components/JsonLd";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Golf Trip Planning Guides & Articles",
  description: "Planning guides, destination guides, trip types, comparisons, and captain's corner articles — everything you need to plan a better golf trip.",
  alternates: { canonical: `${SITE_URL}/articles` },
};

const CATEGORIES = [
  {
    name: "Comparisons",
    slug: "comparisons",
    label: "Head-to-Head Comparisons",
    description: "Matchups, overrated lists, and honest takes on your dollar.",
  },
  {
    name: "Destinations",
    slug: "destinations",
    label: "Destination Guides",
    description: "State-by-state guides to America's best golf.",
  },
  {
    name: "Trip Types",
    slug: "trip-types",
    label: "Trip Types",
    description: "Bachelor parties, weekenders, budget trips, and more.",
  },
  {
    name: "Planning",
    slug: "planning",
    label: "Planning Guides",
    description: "How to book, pack, budget, and run a golf trip.",
  },
];

export default async function ArticlesPage() {
  const articles = await getArticlesForIndex();

  const featured = articles[0];

  const byCategory = Object.fromEntries(
    CATEGORIES.map((cat) => [
      cat.name,
      articles.filter((a) => a.category === cat.name),
    ])
  );

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Articles", item: `${SITE_URL}/articles` },
    ],
  };

  return (
    <main className={styles.page}>
      <JsonLd data={breadcrumbSchema} />

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Golf Trip Planning Guides &amp; Articles</h1>
      </div>

      {featured && (
        <div className={styles.featuredWrap}>
          <div className={styles.featuredCard}>
            <div className={styles.featuredImageWrap}>
              <Image
                src={`/images/articles/${featured.slug}.jpg`}
                alt={featured.name}
                fill
                priority
                className={styles.featuredImage}
                sizes="(max-width: 900px) 100vw, 55vw"
              />
              <ShareButton
                itemType="article"
                itemId={featured.slug ?? ""}
                itemName={featured.name}
                variant="dark"
                corner
              />
            </div>
            <div className={styles.featuredBody}>
              <p className={styles.featuredEyebrow}>Latest Article</p>
              <h2 className={styles.featuredTitle}>
                <Link href={`/articles/${featured.slug}`} className={styles.featuredTitleLink}>
                  {featured.name}
                </Link>
              </h2>
              {featured.teaser && (
                <p className={styles.featuredTeaser}>{featured.teaser}</p>
              )}
              {(featured.author || featured.publishedOn) && (
                <div className={styles.featuredMeta}>
                  {featured.author && <span>{featured.author}</span>}
                  {featured.author && featured.publishedOn && (
                    <span className={styles.dot}>•</span>
                  )}
                  {featured.publishedOn && (
                    <span className={styles.featuredDate}>{formatPublishedDate(featured.publishedOn)}</span>
                  )}
                </div>
              )}
              <Link href={`/articles/${featured.slug}`} className={styles.featuredCta}>
                Read article →
              </Link>
            </div>
          </div>
        </div>
      )}

      {CATEGORIES.map((cat) => {
        const catArticles = byCategory[cat.name] ?? [];
        const preview = catArticles.slice(0, 3);
        if (preview.length === 0) return null;

        return (
          <section key={cat.slug} className={styles.hubSection}>
            <div className={styles.hubSectionHead}>
              <div className={styles.hubSectionLeft}>
                <h2 className={styles.hubLabel}>{cat.label}</h2>
                <p className={styles.hubDesc}>{cat.description}</p>
              </div>
              <Link
                href={`/articles/category/${cat.slug}`}
                className={styles.hubSeeAll}
              >
                See all {catArticles.length} {cat.label.toLowerCase()} →
              </Link>
            </div>

            <div className={styles.cardRow}>
              {preview.map((article) => {
                const href = `/articles/${article.slug}`;
                return (
                  <article key={article.id} className={styles.card}>
                    <div className={styles.newsMedia}>
                      <Link href={href} className={styles.newsImageLink} aria-label={article.name}>
                        <img
                          className={styles.newsImg}
                          src={`/images/articles/${article.slug}.jpg`}
                          alt={article.name}
                          loading="lazy"
                        />
                      </Link>
                      <ShareButton
                        itemType="article"
                        itemId={article.slug ?? ""}
                        itemName={article.name}
                        variant="dark"
                        corner
                        small
                      />
                    </div>
                    <div className={styles.newsBody}>
                      <div className={styles.newsTitle}>
                        <Link href={href} className={styles.newsTitleLink}>
                          {article.name}
                        </Link>
                      </div>
                      {article.teaser && (
                        <p className={styles.newsTeaser}>{article.teaser}</p>
                      )}
                      {(article.author || article.publishedOn) && (
                        <div className={styles.newsMeta}>
                          {article.author && (
                            <span className={styles.newsAuthor}>{article.author}</span>
                          )}
                          {article.publishedOn && (
                            <span className={styles.newsDate}>
                              {formatPublishedDate(article.publishedOn)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className={styles.hubViewAll}>
        <Link href="/articles/all" className={styles.hubViewAllLink}>
          View all {articles.length} articles →
        </Link>
      </div>
    </main>
  );
}
