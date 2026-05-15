import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getArticlesForIndex } from "../../lib/airtable";
import { formatPublishedDate } from "../../lib/formatters";
import styles from "../../styles/articles.module.css";
import { SITE_URL } from "../../lib/seo";
import EmailSignup from "@/components/EmailSignup";
import ShareButton from "@/components/ShareButton";
import { JsonLd } from "@/components/JsonLd";

export const revalidate = 3600;

const PAGE_SIZE = 9;

function pageUrl(n: number) {
  return n === 1 ? "/articles" : `/articles?page=${n}`;
}

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10));
  const canonical = pageNum === 1 ? `${SITE_URL}/articles` : `${SITE_URL}/articles?page=${pageNum}`;
  return {
    title: pageNum === 1 ? "Golf Trip Articles & Planning Guides" : `Golf Trip Articles & Planning Guides — Page ${pageNum}`,
    description: "Planning guides, head-to-head trip comparisons, and editorial coverage of America's best golf destinations — from Bandon Dunes to Pinehurst.",
    alternates: { canonical },
  };
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const articles = await getArticlesForIndex();

  const featured = articles[0];
  const remaining = articles.slice(1);
  const totalPages = Math.max(1, Math.ceil(remaining.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, parseInt(page ?? "1", 10)), totalPages);

  const gridStart = (currentPage - 1) * PAGE_SIZE;
  const gridArticles = remaining.slice(gridStart, gridStart + PAGE_SIZE);
  const pages = getPageNumbers(currentPage, totalPages);

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
        <h1 className={styles.pageTitle}>Golf Trip Articles &amp; Planning Guides</h1>
      </div>

      {/* Featured hero — page 1 only */}
      {currentPage === 1 && featured && (
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

      {/* Grid */}
      {gridArticles.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {currentPage === 1 ? "More articles" : "Articles"}
          </h2>
          <div className={styles.cardRow}>
            {gridArticles.map((article) => {
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

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className={styles.pagination} aria-label="Article pages">
              {currentPage > 1 ? (
                <Link href={pageUrl(currentPage - 1)} className={styles.pageArrow} aria-label="Previous page">
                  ←
                </Link>
              ) : (
                <span className={`${styles.pageArrow} ${styles.pageArrowDisabled}`} aria-hidden="true">←</span>
              )}

              {pages.map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className={styles.pageEllipsis}>…</span>
                ) : (
                  <Link
                    key={p}
                    href={pageUrl(p)}
                    className={`${styles.pageNum} ${p === currentPage ? styles.pageNumActive : ""}`}
                    aria-current={p === currentPage ? "page" : undefined}
                  >
                    {p}
                  </Link>
                )
              )}

              {currentPage < totalPages ? (
                <Link href={pageUrl(currentPage + 1)} className={styles.pageArrow} aria-label="Next page">
                  →
                </Link>
              ) : (
                <span className={`${styles.pageArrow} ${styles.pageArrowDisabled}`} aria-hidden="true">→</span>
              )}
            </nav>
          )}
        </section>
      )}

      <EmailSignup
        heading="Get the next article first."
        subtext="New stories from GTI, straight to your inbox."
        buttonText="Sign up"
      />
    </main>
  );
}
