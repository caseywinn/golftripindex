import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import {
  getClubBySlug,
  getClubViewer,
  canView,
  canManage,
  listMembers,
  listRequests,
  countSeats,
  countActiveMembers,
  type ClubMember,
} from "@/lib/clubs";
import ClubInvite from "@/components/ClubInvite";
import ClubJoinRequest from "@/components/ClubJoinRequest";
import ClubRequests from "@/components/ClubRequests";
import ClubMemberMenu from "@/components/ClubMemberMenu";
import styles from "@/styles/clubs.module.css";

export const dynamic = "force-dynamic";

// Clubs are private and invite-only. Even the public opt-in (clubs.is_public)
// only ever exposes a separate profile page — the roster view is never indexed.
export const metadata: Metadata = {
  title: "Club",
  robots: { index: false, follow: false },
};

function initials(name: string | null, email: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return email[0]?.toUpperCase() ?? "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function pillFor(m: ClubMember): { label: string; className: string } {
  if (m.status === "invited") return { label: "Invited", className: styles.pillInvited };
  if (m.status === "suspended") return { label: "Susp.", className: styles.pillSuspended };
  if (m.role === "owner") return { label: "Owner", className: styles.pillOwner };
  if (m.role === "admin") return { label: "Admin", className: styles.pillAdmin };
  return { label: "Member", className: "" };
}

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/register?callbackUrl=/clubs/${encodeURIComponent(slug)}`);
  }

  const pool = getPgPool();
  const club = await getClubBySlug(slug, pool);
  if (!club) notFound();

  const viewer = await getClubViewer(club.id, session.user.id, pool);

  // Non-members get a stub they can request membership from. It shows the club's
  // name, home course, and member COUNT — never the roster. Club existence is
  // public to anyone with the URL; who's in it stays private.
  if (!canView(viewer)) {
    const memberCount = await countActiveMembers(club.id, pool);
    return (
      <main className={styles.stub}>
        <div className={styles.stubCard}>
          <h1 className={styles.stubName}>{club.name}</h1>
          <p className={styles.stubMeta}>
            {club.homeCourse ? `${club.homeCourse} · ` : ""}
            {memberCount} member{memberCount === 1 ? "" : "s"}
          </p>
          <p className={styles.stubBlurb}>
            This club plans its golf trips here. Ask to join and an admin will approve you.
          </p>
          <ClubJoinRequest slug={club.slug} pending={viewer.status === "requested"} />
        </div>
      </main>
    );
  }

  const [members, seats, requests] = await Promise.all([
    listMembers(club.id, pool),
    countSeats(club, pool),
    canManage(viewer) ? listRequests(club.id, pool) : Promise.resolve([]),
  ]);

  const manages = canManage(viewer);
  const used = seats.active + seats.pending;
  const remaining = Math.max(0, seats.limit - used);
  const activePct = Math.min(100, (seats.active / seats.limit) * 100);
  const pendingPct = Math.min(100 - activePct, (seats.pending / seats.limit) * 100);

  return (
    <>
      <header className={styles.heroWrap}>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.heroTitle}>{club.name}</h1>
            {club.homeCourse && <p className={styles.heroSub}>Home course · {club.homeCourse}</p>}
          </div>
          {!club.isPublic && <span className={styles.privacyPill}>Private</span>}
        </div>
      </header>

      <div className={styles.layout}>
        <main className={styles.main}>
          <section>
            <h2 className={styles.sectionTitle}>Next trip</h2>
            <div className={styles.empty}>
              <p className={styles.emptyText}>
                No trip in the works yet. Proposing and voting on trips is coming next.
              </p>
            </div>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>Previous trips</h2>
            <div className={styles.empty}>
              <p className={styles.emptyText}>
                No trips played yet. Once you finish one, it lands here with photos, results, and
                who came.
              </p>
            </div>
          </section>
        </main>

        <aside className={styles.rail}>
          <div className={styles.railHead}>
            <span className={styles.railTitle}>The Club</span>
          </div>

          <div className={styles.railBody}>
            <div className={styles.railSection}>
              <div className={styles.railSectionRow}>
                <span className={styles.railSectionLabel}>Seats</span>
              </div>
              <div className={styles.seatNums}>
                <b>{seats.active}</b> active
                {seats.pending > 0 && (
                  <>
                    {" · "}
                    <b>{seats.pending}</b> pending
                  </>
                )}
                {" · "}
                <b>{seats.limit}</b> total
              </div>
              <div
                className={styles.meter}
                role="img"
                aria-label={`${seats.active} of ${seats.limit} seats active, ${seats.pending} pending`}
              >
                <div className={styles.meterFill} style={{ width: `${activePct}%` }} />
                <div className={styles.meterPending} style={{ width: `${pendingPct}%` }} />
              </div>
              {seats.pending > 0 && (
                <p className={styles.seatNote}>
                  A pending invite holds a seat until it&rsquo;s claimed.
                </p>
              )}
            </div>

            {manages && (
              <ClubRequests
                slug={club.slug}
                seatsLeft={remaining}
                requests={requests.map((r) => ({ email: r.email, name: r.name }))}
              />
            )}

            <div className={styles.railSection}>
              <div className={styles.railSectionRow}>
                <span className={styles.railSectionLabel}>Roster</span>
                <span className={styles.railCount}>{members.length}</span>
              </div>

              {members.map((m) => {
                const pill = pillFor(m);
                const unclaimed = !m.userId;
                return (
                  <div
                    key={m.email}
                    className={`${styles.mrow} ${m.status === "invited" ? styles.mrowPending : ""}`}
                  >
                    <div
                      className={`${styles.avatar} ${unclaimed ? styles.avatarUnclaimed : ""}`}
                      aria-hidden="true"
                    >
                      {initials(m.name, m.email)}
                    </div>
                    <div className={styles.who}>
                      {/* An unclaimed invite has no users row, so there is no name
                          to show — the email is the only identity that exists. */}
                      <div className={`${styles.mname} ${!m.name ? styles.mnameUnknown : ""}`}>
                        {m.name ?? "Hasn't joined yet"}
                      </div>
                      <div className={styles.mmail}>{m.email}</div>
                    </div>
                    <span className={`${styles.pill} ${pill.className}`}>{pill.label}</span>
                    {manages && m.status !== "requested" && m.status !== "removed" && (
                      <ClubMemberMenu
                        slug={club.slug}
                        email={m.email}
                        role={m.role}
                        status={m.status}
                        viewerRole={viewer.role === "owner" ? "owner" : "admin"}
                        isSelf={m.userId === session.user.id}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {manages && <ClubInvite slug={club.slug} seatsLeft={remaining} />}
        </aside>
      </div>
    </>
  );
}
