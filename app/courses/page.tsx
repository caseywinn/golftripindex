import Link from "next/link";
import styles from "../../styles/courseRankings.module.css";
import { getPublishedCourses } from "../../lib/airtable";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Course Rankings | GolfTripIndex",
  description:
    "A conslidated list of the top 100 golf courses in the United States.",
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
  const courses = (await getPublishedCourses()) as Course[];

  // Sort by consolidated ranking (NR last), then name
  const sorted = [...courses].sort((a, b) => {
    const ar = a.consolidatedRanking ?? Number.POSITIVE_INFINITY;
    const br = b.consolidatedRanking ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    return (a.name || "").localeCompare(b.name || "");
  });

  return (
    <main className={styles.page}>
      {/* Banner */}
      <section className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true" />

        <div className={styles.bannerPanel}>
          <div className={styles.bannerTitle}>Golf Course Rankings</div>
          <div className={styles.bannerSub}>
            GolfTripIndex course rankings are calculated as an average of the major golf publications, providing a single, objective view that reflects the broader consensus rather than one editorial perspective.
          </div>

          <div className={styles.segment}>
            <div className={styles.segmentItem}>
              Consolidated on Jan 16, 2026
            </div>
          </div>
        </div>
      </section>

    {/* Trip tiles */}
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
