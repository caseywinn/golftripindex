import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Airtable from "airtable";
import { formatPublishedDate } from "../../../lib/formatters";
import styles from "../../../styles/article.module.css";


type Article = {
  id: string;
  name: string;
  slug: string;
  teaser?: string | null;
  fullText?: string | null;
  author?: string | null;
  publishedOn?: string | null;
  status?: string | null;
};

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

  return {
    id: r.id,
    name: String(f["Name"] ?? ""),
    slug: String(f["Slug"] ?? ""),
    teaser: f["Teaser"] ? String(f["Teaser"]) : null,
    fullText: f["Full Text"] ? String(f["Full Text"]) : null,
    author: f["Author"] ? String(f["Author"]) : null,
    publishedOn: f["Published On"] ? String(f["Published On"]) : null,
    status: f["Status"] ? String(f["Status"]) : null,
  };
}

/**
 * Full Text parsing rules:
 * - Section header: "##The Golf Course##"
 * - Image placeholder: "##Image 1##" -> /images/article/[slug]-1.jpg
 * - Otherwise: paragraphs separated by blank lines.
 */
type Block =
  | { type: "h2"; text: string }
  | { type: "image"; index: number }
  | { type: "p"; text: string };

function parseFullText(fullText: string): Block[] {
  const lines = fullText.replace(/\r\n/g, "\n").split("\n");

  const blocks: Block[] = [];
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    const text = paragraphBuf.join(" ").trim();
    if (text) blocks.push({ type: "p", text });
    paragraphBuf = [];
  };

  const headerRe = /^\s*##\s*(.+?)\s*##\s*$/;
  const imageRe = /^\s*##\s*Image\s+(\d+)\s*##\s*$/i;

  for (const raw of lines) {
    const line = raw.trim();

    // Blank line -> paragraph break
    if (!line) {
      flushParagraph();
      continue;
    }

    // Image placeholder
    const im = line.match(imageRe);
    if (im) {
      flushParagraph();
      blocks.push({ type: "image", index: Number(im[1]) });
      continue;
    }

    // Header line
    const hm = line.match(headerRe);
    if (hm) {
      flushParagraph();
      blocks.push({ type: "h2", text: hm[1].trim() });
      continue;
    }

    // Otherwise accumulate text
    paragraphBuf.push(line);
  }

  flushParagraph();
  return blocks;
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
                  {b.text}
                </h2>
              );
            }

            if (b.type === "image") {
              const src = `/images/articles/${article.slug}-${b.index}.jpg`;

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

            return (
              <p key={`p-${i}`} className={styles.p}>
                {b.text}
              </p>
            );
          })}
        </article>
      </section>
    </main>
  );
}
