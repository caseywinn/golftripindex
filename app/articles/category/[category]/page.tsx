import Link from "next/link";
import type { Metadata } from "next";
import { getArticlesForIndex } from "../../../../lib/airtable";
import { formatPublishedDate } from "../../../../lib/formatters";
import styles from "../../../../styles/articles.module.css";
import { SITE_URL } from "../../../../lib/seo";
import ShareButton from "@/components/ShareButton";
import { JsonLd } from "@/components/JsonLd";
import { notFound } from "next/navigation";

export const revalidate = 3600;

const PAGE_SIZE = 9;

const CATEGORIES: Record<string, { name: string; label: string; description: string }> = {
  comparisons: {
    name: "Comparisons",
    label: "Head-to-Head Comparisons",
    description: "Head-to-head destination matchups, overrated lists, and honest takes on where to spend your money.",
  },
  destinations: {
    name: "Destinations",
    label: "Destination Guides",
    description: "State-by-state and resort-specific guides to the best golf destinations in America.",
  },
  "trip-types": {
    name: "Trip Types",
    label: "Trip Types",
    description: "Bachelor parties, weekend getaways, budget trips, father-son trips, and more.",
  },
  planning: {
    name: "Planning",
    label: "Planning Guides",
    description: "How to book, pack, budget, organize, and run a golf trip from start to finish.",
  },
};

function pageUrl(categorySlug: string, n: number) {
  return n === 1
    ? `/articles/category/${categorySlug}`
    : `/articles/category/${categorySlug}?page=${n}`;
}

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const cat = CATEGORIES[category];
  if (!cat) return {};
  return {
    title: `${cat.label} — Golf Trip Articles`,
    description: cat.description,
    alternates: { canonical: `${SITE_URL}/articles/category/${category}` },
  };
}

export async function generateStaticParams() {
  return Object.keys(CATEGORIES).map((category) => ({ category }));
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { category } = await params;
  const { page } = await searchParams;
  const cat = CATEGORIES[category];
  if (!cat) notFound();

  const allArticles = await getArticlesForIndex();
  const articles = allArticles.filter((a) => a.category === cat.name);

  const totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, parseInt(page ?? "1", 10)), totalPages);
  const pageArticles = articles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pages = getPageNumbers(currentPage, totalPages);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Articles", item: `${SITE_URL}/articles` },
      { "@type": "ListItem", position: 3, name: cat.label, item: `${SITE_URL}/articles/category/${category}` },
    ],
  };

  return (
    <main className={styles.page}>
      <JsonLd data={breadcrumbSchema} />

      <div className={styles.pageHeader}>
        <p className={styles.pageBack}>
          <Link href="/articles">← Back to Articles</Link>
        </p>
        <h1 className={styles.pageTitle}>{cat.label}</h1>
        <p className={styles.pageSubtitle}>{cat.description}</p>
      </div>

      <section className={styles.section}>
        <div className={styles.cardRow}>
          {pageArticles.map((article) => {
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
              <Link href={pageUrl(category, currentPage - 1)} className={styles.pageArrow} aria-label="Previous page">←</Link>
            ) : (
              <span className={`${styles.pageArrow} ${styles.pageArrowDisabled}`} aria-hidden="true">←</span>
            )}
            {pages.map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className={styles.pageEllipsis}>…</span>
              ) : (
                <Link
                  key={p}
                  href={pageUrl(category, p)}
                  className={`${styles.pageNum} ${p === currentPage ? styles.pageNumActive : ""}`}
                  aria-current={p === currentPage ? "page" : undefined}
                >
                  {p}
                </Link>
              )
            )}
            {currentPage < totalPages ? (
              <Link href={pageUrl(category, currentPage + 1)} className={styles.pageArrow} aria-label="Next page">→</Link>
            ) : (
              <span className={`${styles.pageArrow} ${styles.pageArrowDisabled}`} aria-hidden="true">→</span>
            )}
          </nav>
        )}
      </section>
    </main>
  );
}
