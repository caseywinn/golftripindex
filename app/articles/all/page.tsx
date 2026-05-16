import Link from "next/link";
import type { Metadata } from "next";
import { getArticlesForIndex } from "../../../lib/airtable";
import { formatPublishedDate } from "../../../lib/formatters";
import styles from "../../../styles/articles.module.css";
import { SITE_URL } from "../../../lib/seo";
import EmailSignup from "@/components/EmailSignup";
import ShareButton from "@/components/ShareButton";
import { JsonLd } from "@/components/JsonLd";

export const revalidate = 3600;

const PAGE_SIZE = 9;

function pageUrl(n: number) {
  return n === 1 ? "/articles/all" : `/articles/all?page=${n}`;
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
  const canonical = pageNum === 1 ? `${SITE_URL}/articles/all` : `${SITE_URL}/articles/all?page=${pageNum}`;
  return {
    title: pageNum === 1 ? "All Golf Trip Articles" : `All Golf Trip Articles — Page ${pageNum}`,
    description: "Every planning guide, destination guide, head-to-head comparison, and captain's corner article from GTI.",
    alternates: { canonical },
  };
}

export default async function AllArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const articles = await getArticlesForIndex();

  const totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, parseInt(page ?? "1", 10)), totalPages);

  const gridStart = (currentPage - 1) * PAGE_SIZE;
  const gridArticles = articles.slice(gridStart, gridStart + PAGE_SIZE);
  const pages = getPageNumbers(currentPage, totalPages);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Articles", item: `${SITE_URL}/articles` },
      { "@type": "ListItem", position: 3, name: "All Articles", item: `${SITE_URL}/articles/all` },
    ],
  };

  return (
    <main className={styles.page}>
      <JsonLd data={breadcrumbSchema} />

      <div className={styles.pageHeader}>
        <p className={styles.pageBack}>
          <Link href="/articles">← Back to Articles</Link>
        </p>
        <h1 className={styles.pageTitle}>Golf Trip Articles &amp; Planning Guides</h1>
      </div>

      {gridArticles.length > 0 && (
        <section className={styles.section}>
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

          {totalPages > 1 && (
            <nav className={styles.pagination} aria-label="Article pages">
              {currentPage > 1 ? (
                <Link href={pageUrl(currentPage - 1)} className={styles.pageArrow} aria-label="Previous page">←</Link>
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
                <Link href={pageUrl(currentPage + 1)} className={styles.pageArrow} aria-label="Next page">→</Link>
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
