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

export const metadata: Metadata = {
  title: "Articles | Golf Trip Index",
  description: "News and stories about the best golf trips in America.",
  alternates: { canonical: `${SITE_URL}/articles` },
};

export default async function ArticlesPage() {
  const articles = await getArticlesForIndex();
  const [featured, ...rest] = articles;

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
                    <span>{formatPublishedDate(featured.publishedOn)}</span>
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

      {rest.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>More articles</h2>
          <div className={styles.cardRow}>
            {rest.map((article) => {
              const href = `/articles/${article.slug}`;
              return (
                <article key={article.id} className={styles.card}>
                  <div className={styles.newsMedia}>
                    <Link href={href} className={styles.newsImageLink} aria-label={article.name}>
                      <img
                        className={styles.newsImg}
                        src={`/images/articles/${article.slug}.jpg`}
                        alt=""
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
      )}

      <EmailSignup
        heading="Get the next article first."
        subtext="New stories from GTI, straight to your inbox."
        buttonText="Sign up"
      />
    </main>
  );
}
