import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadPoll } from "@/lib/planPoll";
import { formatTripWhen, type WhenLike } from "@/lib/planWhen";
import styles from "@/styles/sharedTrip.module.css";
import PollClient from "./PollClient";

export const metadata: Metadata = {
  title: "A shared golf trip | GolfTripIndex",
  description: "A golf trip shared with you on Golf Trip Index.",
  robots: { index: false },
};

function dollars(n: number | null | undefined): string {
  if (!n || n < 1) return "";
  return "$".repeat(Math.min(5, Math.max(1, n)));
}

export default async function SharedTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const viewer = { userId: session?.user?.id ?? null, email: session?.user?.email ?? null };

  const result = await loadPoll(id, viewer);
  // A club vote is members-only, so a signed-out viewer is sent to log in rather
  // than 404'd — they may well be a member. A /plan share never takes this path;
  // it stays public and votes are cast before signing in.
  if (!result.ok && result.reason === "login") {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/plan/shared/${id}`)}`);
  }
  if (!result.ok) notFound();
  const view = result.view;

  // Group vote → interactive ballot. Read-only share → the simple list below.
  if (view.vote) {
    return <PollClient initial={view} />;
  }

  const dests = view.destinations;
  const whenStr = formatTripWhen(view.when as WhenLike, view.nights ?? 0);
  const sharedBy = (view.sharedBy ?? "").trim();

  const meta = [
    view.golfers ? `${view.golfers} golfer${view.golfers === 1 ? "" : "s"}` : "",
    view.nights ? `${view.nights} night${view.nights === 1 ? "" : "s"}` : "",
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
