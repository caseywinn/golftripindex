import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPgPool } from "@/lib/db";
import { formatTripWhen, type WhenLike } from "@/lib/planWhen";
import styles from "@/styles/sharedTrip.module.css";

export const metadata: Metadata = {
  title: "A shared golf trip | GolfTripIndex",
  description: "A golf trip shared with you on Golf Trip Index.",
  robots: { index: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Dest = { slug: string; name: string; overallRating?: number | null; costTier?: number | null };
type SharedState = {
  destinations?: Dest[];
  golfers?: number | null;
  nights?: number | null;
  when?: WhenLike | null;
  sharedBy?: string | null;
};

function dollars(n: number | null | undefined): string {
  if (!n || n < 1) return "";
  return "$".repeat(Math.min(5, Math.max(1, n)));
}

async function getSharedTrip(id: string): Promise<SharedState | null> {
  if (!UUID_RE.test(id)) return null;
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT state FROM shared_trips WHERE id = $1`, [id]);
  return rows.length ? (rows[0].state as SharedState) : null;
}

export default async function SharedTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getSharedTrip(id);
  if (!state) notFound();

  const dests = Array.isArray(state.destinations) ? state.destinations : [];
  const whenStr = formatTripWhen(state.when, state.nights ?? 0);
  const sharedBy = (state.sharedBy ?? "").trim();

  const meta = [
    state.golfers ? `${state.golfers} golfer${state.golfers === 1 ? "" : "s"}` : "",
    state.nights ? `${state.nights} night${state.nights === 1 ? "" : "s"}` : "",
    whenStr,
  ].filter(Boolean);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>{sharedBy ? `Shared by ${sharedBy}` : "A shared golf trip"}</p>
          <h1 className={styles.title}>
            {dests.length === 1 ? dests[0].name : "A golf trip to consider"}
          </h1>
          {meta.length > 0 && (
            <div className={styles.meta}>
              {meta.map((m) => <span key={m} className={styles.metaPill}>{m}</span>)}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>{dests.length === 1 ? "Destination" : `${dests.length} destinations`}</div>
          {dests.map((d) => (
            <Link key={d.slug} href={`/trips/${d.slug}`} className={styles.dest}>
              <img src={`/images/trips/${d.slug}.jpg`} alt="" aria-hidden="true" className={styles.destImg} />
              <div className={styles.destInfo}>
                <div className={styles.destName}>{d.name}</div>
                <div className={styles.destMeta}>
                  {[dollars(d.costTier), d.overallRating != null ? Number(d.overallRating).toFixed(2) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <span className={styles.destArrow}>→</span>
            </Link>
          ))}
        </div>

        <div className={styles.footer}>
          <Link href="/plan" className={styles.cta}>Plan your own golf trip →</Link>
          <p className={styles.footNote}>Shared via Golf Trip Index — no account required to view.</p>
        </div>
      </div>
    </div>
  );
}
