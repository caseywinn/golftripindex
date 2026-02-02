import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Airtable from "airtable";
import { Article } from "../../../lib/types";
import { formatPublishedDate } from "../../../lib/formatters";
import styles from "../../../styles/article.module.css";
import { renderInlineRich, parseFullText, Block } from "../../../lib/richText";
import React from "react";

function getBase() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    throw new Error(
      "Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID env vars for Airtable."
    );
  }

  Airtable.configure({ apiKey });
  return Airtable.base(baseId);
}

const ARTICLES_TABLE = process.env.AIRTABLE_ARTICLES_TABLE || "Articles";

function getAirtableUrlField(f: any, key: string): string | null {
  const v = f?.[key];

  // If it's an Attachment field, Airtable returns an array of objects with `url`.
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.url === "string") {
    return v[0].url;
  }

  // If it's a plain URL field
  if (typeof v === "string" && v.trim()) return v.trim();

  return null;
}

async function getPublishedArticleBySlug(slug: string): Promise<Article | null> {
  const base = getBase();

  const records = await base(ARTICLES_TABLE)
    .select({
      maxRecords: 1,
      filterByFormula: `AND({Status}="published",{Slug}="${slug}")`,
    })
    .all();

  const r = records?.[0];
  if (!r) return null;

  const f: any = r.fields;

  // NEW: collect Image N URL fields into a map
  const imageUrls: Record<number, string> = {};
  for (let n = 1; n <= 20; n++) {
    const url = getAirtableUrlField(f, `Image ${n}`);
    if (url) imageUrls[n] = url;
  }

  return {
    id: r.id,
    name: String(f["Name"] ?? ""),
    slug: String(f["Slug"] ?? ""),
    teaser: f["Teaser"] ? String(f["Teaser"]) : null,
    fullText: f["Full Text"] ? String(f["Full Text"]) : null,
    author: f["Author"] ? String(f["Author"]) : null,
    publishedOn: f["Published On"] ? String(f["Published On"]) : null,
    status: f["Status"] ? String(f["Status"]) : null,
    imageUrls,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) return {};

  return {
    title: `${article.name} | GolfTripIndex`,
    description: article.teaser ?? undefined,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const article = await getPublishedArticleBySlug(slug);
  if (!article) return notFound();

  const published = formatPublishedDate(article.publishedOn);
  const blocks = parseFullText(article.fullText ?? "");

  const heroSrc = `/images/articles/${article.slug}.jpg`;

  return (
    <main className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroImageWrap}>
          <Image
            src={heroSrc}
            alt={article.name}
            fill
            priority
            className={styles.heroImage}
            sizes="(max-width: 900px) 100vw, 60vw"
          />
        </div>

        <div className={styles.heroPanel}>
          <h1 className={styles.title}>{article.name}</h1>

          {article.teaser ? (
            <p className={styles.teaser}>{article.teaser}</p>
          ) : null}

          <div className={styles.meta}>
            {article.author ? <span>{article.author}</span> : null}
            {article.author && published ? <span className={styles.dot}>•</span> : null}
            {published ? <span>{published}</span> : null}
          </div>
        </div>
      </section>

      {/* BODY */}
      <section className={styles.body}>
        <article className={styles.article}>
          {blocks.map((b, i) => {
            if (b.type === "h2") {
              return (
                <h2 key={`h2-${i}`} className={styles.h2}>
                  {renderInlineRich(b.text, { linkClassName: styles.articleLink })}
                </h2>
              );
            }

            if (b.type === "image") {
              const src = article.imageUrls?.[b.index] ?? `/images/articles/${article.slug}-${b.index}.jpg`;

              return (
                <figure key={`img-${i}`} className={styles.fullBleed}>
                  <div className={styles.fullBleedInner}>
                    <div className={styles.fullBleedImageWrap}>
                      <Image
                        src={src}
                        alt={`${article.name} image ${b.index}`}
                        fill
                        className={styles.fullBleedImage}
                        sizes="(max-width: 1200px) 100vw, 1200px"
                      />
                    </div>
                  </div>
                </figure>
              );
            }

            if (b.type === "p") {
              return (
                <p key={`p-${i}`} className={styles.p}>
                  {b.lines.map((line, j) => (
                    <React.Fragment key={j}>
                      {renderInlineRich(line, { linkClassName: styles.articleLink })}
                      {j < b.lines.length - 1 ? <br /> : null}
                    </React.Fragment>
                  ))}
                </p>
              );
            }

            // (optional safety fallback)
            return null;

          })}
        </article>
      </section>
    </main>
  );
}
