import styles from "../../styles/courseRankings.module.css";
import { getPublishedCourses } from "../../lib/airtable";
import type { Metadata } from "next";
import { SITE_URL } from "../../lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  // absolute: the brand suffix would push this past 60 characters, and the
  // differentiator — that this merges the three magazines — is worth more
  // in a result than the brand is.
  title: { absolute: "Top 100 Golf Courses: Three Rankings, One List" },
  description:
    "Golf Digest, Golf.com and Golfweek disagree on the best golf courses in America. This ranking averages all three into one consolidated top 100.",
  alternates: { canonical: `${SITE_URL}/courses` },
};

type Course = {
  id: string;
  slug: string;
  name: string;
  state?: string | null;
  golfDigestRanking?: number | null;
  golfDotComRanking?: number | null;
  golfweekRanking?: number | null;
  consolidatedRanking?: number | null;
  // Optional if you already have it in Airtable:
  thumbnailImageUrl?: string | null;
};

function fmtRank(n?: number | null) {
  return typeof n === "number" && !Number.isNaN(n) ? `#${n}` : "NR";
}

export default async function CourseRankingsPage() {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Course Rankings", item: `${SITE_URL}/courses` },
    ],
  };

  const courses = (await getPublishedCourses()) as Course[];

  // Sort by consolidated ranking (NR last), then name
  const sorted = [...courses].sort((a, b) => {
    const ar = a.consolidatedRanking ?? Number.POSITIVE_INFINITY;
    const br = b.consolidatedRanking ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    return (a.name || "").localeCompare(b.name || "");
  });

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "The Top 100 Golf Courses, Consolidated",
    description: "The top 100 golf courses in the United States, ranked by averaging the Golf Digest, Golf.com, and Golfweek rankings into a single consolidated list.",
    url: `${SITE_URL}/courses`,
    itemListElement: sorted
      .filter((c) => c.consolidatedRanking != null)
      .slice(0, 100)
      .map((c, i) => ({
        "@type": "ListItem",
        position: c.consolidatedRanking ?? i + 1,
        name: c.name,
        url: `${SITE_URL}/courses`,
      })),
  };

  return (
    <main className={styles.page}>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={itemListSchema} />
      {/* Banner */}
      <section className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true" />

        <div className={styles.bannerPanel}>
          <h1 className={styles.bannerTitle}>The Top 100 Golf Courses, Consolidated</h1>
          <div className={styles.bannerSub}>
            Golf Digest, Golf.com and Golfweek each publish their own top 100, and the three rarely agree. We average all of them into a single ranking, so what you get is the consensus across the major publications rather than one magazine&apos;s editorial view.
          </div>

          <div className={styles.segment}>
            <div className={styles.segmentItem}>
              Consolidated on Jan 16, 2026
            </div>
          </div>
        </div>
      </section>

    {/* Course table */}
      <section className={styles.listWrap}>
<div className={`${styles.tableWrap} whiteRoundedBox`}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.colRankStrong}></th>
                        <th className={styles.colThumb}></th>
                        <th className={styles.colName}>Name</th>
                        <th className={styles.colState}>State</th>
                        <th className={styles.colRank}>Golf Digest</th>
                        <th className={styles.colRank}>Golf.com</th>
                        <th className={styles.colRank}>Golfweek</th>
                    </tr>
                </thead>

            <tbody>
                {sorted.map((c) => {
                const img =
                    c.thumbnailImageUrl ||
                    `/images/courses/${c.slug.toLowerCase()}.jpg`;

                return (
                    <tr key={c.id} className={styles.row}>
                        <td className={styles.rankCellStrong}>
                        {fmtRank(c.consolidatedRanking)}
                    </td>
                    <td className={styles.thumbCell}>
                        <div
                        className={styles.thumb}
                        style={{ backgroundImage: `url("${img}")` }}
                        aria-label={`${c.name} thumbnail`}
                        />
                    </td>

                    <td className={styles.nameCell}>
                        {c.name}
                    </td>

                    <td className={styles.stateCell}>{c.state ?? "—"}</td>

                    <td className={styles.rankCell}>
                        {fmtRank(c.golfDigestRanking)}
                    </td>
                    <td className={styles.rankCell}>
                        {fmtRank(c.golfDotComRanking)}
                    </td>
                    <td className={styles.rankCell}>
                        {fmtRank(c.golfweekRanking)}
                    </td>

                    
                    </tr>
                );
                })}
            </tbody>
            </table>
        </div>
      </section>
    </main>
  );
}
