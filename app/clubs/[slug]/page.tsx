import { redirect, notFound } from "next/navigation";
import Link from "next/link";
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
import { getCurrentClubTrip, listPastClubTrips, type ClubTrip } from "@/lib/clubTrips";
import { VOTE_TYPES } from "@/lib/planVote";
import ClubInvite from "@/components/ClubInvite";
import ClubJoinRequest from "@/components/ClubJoinRequest";
import ClubRequests from "@/components/ClubRequests";
import ClubMemberMenu from "@/components/ClubMemberMenu";
import ClubTripActions from "@/components/ClubTripActions";
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

/** The name behind a winning slug, falling back to the slug if it's not in the list. */
function destName(trip: ClubTrip, slug: string): string {
  return trip.destinations.find((d) => d.slug === slug)?.name ?? slug;
}

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  live: "On the trip",
  completed: "Played",
  archived: "Shelved",
  draft: "Draft",
};

function TripCard({ trip, slug, manages }: { trip: ClubTrip; slug: string; manages: boolean }) {
  const voting = trip.status === "voting" && trip.voteStatus === "open";
  // The poll closed but named no winner — an exact tie, which deliberately does
  // not auto-lock (see planPoll.recordClubWinner). The trip is stuck in VOTING
  // and, since only one trip may be open at a time, it blocks the whole club
  // until an admin settles it. Say so plainly rather than showing a mute card.
  const tied = trip.status === "voting" && trip.voteStatus === "closed" && !trip.chosenDestination;
  const voteLabel = VOTE_TYPES.find((v) => v.key === trip.voteType)?.label ?? null;
  const pct = trip.roster.size ? (trip.roster.voted / trip.roster.size) * 100 : 0;

  const heading = trip.chosenDestination
    ? destName(trip, trip.chosenDestination)
    : trip.title ?? `${trip.destinations.length} trips on the table`;

  return (
    <div className={styles.tripCard}>
      <div className={styles.tripCardTop}>
        <span className={`${styles.tripStatus} ${voting || tied ? "" : styles.tripStatusPlanning}`}>
          {voting ? "Voting open" : tied ? "Tied" : STATUS_LABEL[trip.status] ?? trip.status}
        </span>
        {voteLabel && voting && <span className={styles.tripMeta}>{voteLabel}</span>}
        {trip.proposedBy && <span className={styles.tripMeta}>Proposed by {trip.proposedBy}</span>}
      </div>

      <h3 className={styles.tripTitle}>{heading}</h3>
      <p className={styles.tripDests}>
        {trip.chosenDestination
          ? `Chosen from ${trip.destinations.length} options. Dates and who's coming are next.`
          : trip.destinations.map((d) => d.name).join(" · ")}
      </p>

      {tied && (
        <p className={styles.tripTieNote}>
          The vote ended in a tie, so no winner was picked automatically — and this trip is
          holding the club&rsquo;s only open slot.{" "}
          {manages ? "Shelve it and propose again." : "An admin will sort it out."}
        </p>
      )}

      {/* Turnout, not results: the poll deliberately hides standings until it
          closes, and leaking them here would undo that. */}
      {voting && trip.roster.size > 0 && (
        <div className={styles.tripTurnout}>
          <div
            className={styles.tripBar}
            role="img"
            aria-label={`${trip.roster.voted} of ${trip.roster.size} members have voted`}
          >
            <div className={styles.tripBarFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.tripTurnoutText}>
            {trip.roster.voted}/{trip.roster.size} voted
          </span>
        </div>
      )}

      {/* A trip with no poll row can't be linked anywhere useful. */}
      {trip.pollId && (
        <Link href={`/plan/shared/${trip.pollId}`} className={styles.tripCta}>
          {voting ? "Vote →" : "See the vote →"}
        </Link>
      )}

      {manages && trip.status !== "completed" && trip.status !== "archived" && (
        <ClubTripActions
          slug={slug}
          tripId={trip.id}
          canComplete={trip.status === "planning" || trip.status === "live"}
        />
      )}
    </div>
  );
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

  const [members, seats, requests, currentTrip, pastTrips] = await Promise.all([
    listMembers(club.id, pool),
    countSeats(club, pool),
    canManage(viewer) ? listRequests(club.id, pool) : Promise.resolve([]),
    getCurrentClubTrip(club.id, pool),
    listPastClubTrips(club.id, pool),
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
            {currentTrip ? (
              <TripCard trip={currentTrip} slug={club.slug} manages={manages} />
            ) : (
              <div className={styles.empty}>
                <p className={styles.emptyText}>
                  {manages
                    ? "No trip in the works. Shortlist some destinations and let the club vote on them."
                    : "No trip in the works yet. An admin will put one to a vote."}
                </p>
                {manages && (
                  <Link href={`/plan?club=${club.slug}`} className={styles.emptyAction}>
                    Propose a trip
                  </Link>
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className={styles.sectionTitle}>Previous trips</h2>
            {pastTrips.length ? (
              pastTrips.map((t) => (
                <TripCard key={t.id} trip={t} slug={club.slug} manages={manages} />
              ))
            ) : (
              <div className={styles.empty}>
                <p className={styles.emptyText}>
                  No trips played yet. Once you finish one, it lands here with photos, results, and
                  who came.
                </p>
              </div>
            )}
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
