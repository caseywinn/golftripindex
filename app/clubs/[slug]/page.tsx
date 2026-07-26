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
import {
  getCurrentClubTrip,
  listPastClubTrips,
  firstPhotoByTrip,
  type ClubTrip,
} from "@/lib/clubTrips";
import { getPublishedTrips } from "@/lib/airtable";
import { VOTE_TYPES } from "@/lib/planVote";
import ClubInvite from "@/components/ClubInvite";
import ClubJoinRequest from "@/components/ClubJoinRequest";
import ClubRequests from "@/components/ClubRequests";
import ClubMemberMenu from "@/components/ClubMemberMenu";
import ClubTripActions from "@/components/ClubTripActions";
import AddPastTrip from "@/components/AddPastTrip";
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

/** Month/year label for a recorded trip's dates, e.g. "Sep 2023" or "Sep – Oct 2023". */
function formatTripDates(start: Date | null, end: Date | null): string | null {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  const s = start.toLocaleDateString("en-US", opts);
  if (!end) return s;
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  return sameMonth ? s : `${s} – ${end.toLocaleDateString("en-US", opts)}`;
}

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  live: "On the trip",
  completed: "Played",
  archived: "Shelved",
  draft: "Draft",
};

function TripCard({
  trip,
  slug,
  manages,
  featured = false,
  coverUrl = null,
}: {
  trip: ClubTrip;
  slug: string;
  manages: boolean;
  /** The open trip gets an image hero; past trips stay as flat cards. */
  featured?: boolean;
  /** First photo from this trip's gallery, shown down the card's left edge. */
  coverUrl?: string | null;
}) {
  const voting = trip.status === "voting" && trip.voteStatus === "open";
  // The poll closed but named no winner — an exact tie, which deliberately does
  // not auto-lock (see planPoll.recordClubWinner). The trip is stuck in VOTING
  // and, since only one trip may be open at a time, it blocks the whole club
  // until an admin settles it. Say so plainly rather than showing a mute card.
  const tied = trip.status === "voting" && trip.voteStatus === "closed" && !trip.chosenDestination;
  const voteLabel = VOTE_TYPES.find((v) => v.key === trip.voteType)?.label ?? null;
  const pct = trip.roster.size ? (trip.roster.voted / trip.roster.size) * 100 : 0;
  const chosen = trip.chosenDestination;
  // A trip with no poll row was added by hand for the club's history, not voted
  // on — its chosen_destination is a free-text place, not a vote winner.
  const manual = !trip.pollId;
  const votedChosen = !!chosen && !manual;

  // A voted winner headlines the destination; a manual entry headlines its name;
  // an unnamed vote asks the question directly. The chosen window (season/month),
  // if set, rides along under a vote as a subtitle.
  const heading = votedChosen
    ? destName(trip, chosen!)
    : trip.title ?? (voting ? "Where should the club go?" : `${trip.destinations.length} trips on the table`);
  const showWhen = !chosen && !!trip.whenLabel;

  // Past-trip detail line: the place (for a manual entry) and when it happened.
  const dateLabel = formatTripDates(trip.startDate, trip.endDate);
  const pastMeta = !featured
    ? [manual ? chosen : null, dateLabel].filter(Boolean).join(" · ")
    : "";

  // Hero imagery: one big tile for a locked winner, else a collage of the first
  // few options on the table. Background-image (not <img>) so a missing photo
  // degrades to the tile's fill colour rather than a broken-image icon.
  const chosenDest = chosen ? trip.destinations.find((d) => d.slug === chosen) : null;
  const heroDests = chosen ? (chosenDest ? [chosenDest] : []) : trip.destinations.slice(0, 4);
  const badge = voting
    ? { text: "Voting open", cls: "" }
    : tied
      ? { text: "Tied", cls: styles.tripHeroBadgeTied }
      : { text: STATUS_LABEL[trip.status] ?? trip.status, cls: styles.tripHeroBadgePlanning };

  // Only past cards take a gallery thumbnail — the featured card already leads
  // with its own destination hero.
  const cover = !featured ? coverUrl : null;

  return (
    <div
      className={`${styles.tripCard} ${featured ? styles.tripCardFeatured : ""} ${
        cover ? styles.tripCardWithMedia : ""
      }`}
    >
      {cover && (
        <Link
          href={`/clubs/${slug}/trips/${trip.id}`}
          className={styles.tripMediaLink}
          aria-label={`View trip: ${heading}`}
        >
          <span className={styles.tripMedia}>
            <span
              className={styles.tripMediaImage}
              style={{ backgroundImage: `url(${cover})` }}
            />
          </span>
        </Link>
      )}

      {featured && heroDests.length > 0 && (
        <div
          className={`${styles.tripHero} ${chosen ? styles.tripHeroSingle : styles.tripHeroGrid}`}
          data-count={heroDests.length}
        >
          {heroDests.map((d) => (
            <div
              key={d.slug}
              className={styles.tripTile}
              style={{ backgroundImage: `url(/images/trips/${d.slug}.jpg)` }}
            >
              <span className={styles.tripTileScrim} aria-hidden="true" />
              <span className={styles.tripTileName}>{d.name}</span>
            </div>
          ))}
          <span className={`${styles.tripHeroBadge} ${badge.cls}`}>{badge.text}</span>
          {chosen && chosenDest?.overallRating != null && (
            <span className={styles.tripHeroRating}>{chosenDest.overallRating.toFixed(2)}</span>
          )}
        </div>
      )}

      <div
        className={featured ? styles.tripCardBody : cover ? styles.tripCardPad : undefined}
      >
        {featured ? (
          (voteLabel && voting) || trip.proposedBy ? (
            <div className={styles.tripCardMeta}>
              {voteLabel && voting && <span className={styles.tripMeta}>{voteLabel}</span>}
              {trip.proposedBy && <span className={styles.tripMeta}>Proposed by {trip.proposedBy}</span>}
            </div>
          ) : null
        ) : (
          <div className={styles.tripCardTop}>
            <span className={`${styles.tripStatus} ${voting || tied ? "" : styles.tripStatusPlanning}`}>
              {voting ? "Voting open" : tied ? "Tied" : STATUS_LABEL[trip.status] ?? trip.status}
            </span>
            {voteLabel && voting && <span className={styles.tripMeta}>{voteLabel}</span>}
            {trip.proposedBy && <span className={styles.tripMeta}>Proposed by {trip.proposedBy}</span>}
          </div>
        )}

        {/* A featured chosen trip already shows the winner's name big on the hero,
            so the heading below would just repeat it. */}
        {!(featured && chosen) && <h3 className={styles.tripTitle}>{heading}</h3>}
        {showWhen && <p className={styles.tripWhen}>{trip.whenLabel}</p>}
        {/* Upcoming winner: prompt the next steps. Past trip: show the place it
            went (for a manual entry) and when. Featured voting names its options
            on the hero tiles, so nothing extra here. */}
        {featured && chosen ? (
          <p className={styles.tripDests}>
            Chosen from {trip.destinations.length} options. Dates and who&rsquo;s coming are next.
          </p>
        ) : !featured && pastMeta ? (
          <p className={styles.tripDests}>{pastMeta}</p>
        ) : null}

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

        {/* While the vote is open, "Vote" is the only action worth offering: the
            trip page has no destination, dates, or attendees to show until the
            poll picks a winner, so "View trip" just leads somewhere empty. It
            returns once the vote closes — including on a tie, which is still
            worth opening. */}
        {(!voting || trip.pollId) && (
          <div className={styles.tripCtaRow}>
            {!voting && (
              <Link href={`/clubs/${slug}/trips/${trip.id}`} className={styles.tripCta}>
                View trip →
              </Link>
            )}
            {/* A trip with no poll row can't be linked to a vote. */}
            {trip.pollId && (
              <Link href={`/plan/shared/${trip.pollId}`} className={styles.tripCta}>
                {voting ? "Vote →" : "See the vote →"}
              </Link>
            )}
          </div>
        )}

        {manages && trip.status !== "completed" && trip.status !== "archived" && (
          <ClubTripActions
            slug={slug}
            tripId={trip.id}
            canComplete={trip.status === "planning" || trip.status === "live"}
          />
        )}
      </div>
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

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
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

  // "Preview page" shows an owner or admin the club as a rank-and-file member
  // sees it. It only ever REMOVES privileges — a plain member who adds the
  // parameter gains nothing, since previewing requires being a manager first —
  // so this is presentation, not access control. Manager-only data isn't even
  // fetched while previewing, which keeps it out of the payload.
  const isManager = canManage(viewer);
  const previewing = isManager && preview === "member";
  const manages = isManager && !previewing;

  const [members, seats, requests, currentTrip, pastTrips, tripsCatalog] = await Promise.all([
    listMembers(club.id, pool),
    countSeats(club, pool),
    manages ? listRequests(club.id, pool) : Promise.resolve([]),
    getCurrentClubTrip(club.id, pool),
    listPastClubTrips(club.id, pool),
    // Only managers see "Add a past trip" (and its destination autocomplete).
    manages
      ? getPublishedTrips().then((ts) => ts.map((t) => ({ slug: t.slug, name: t.name })))
      : Promise.resolve([] as { slug: string; name: string }[]),
  ]);

  // Respect each trip's visibility: an 'attendees'-only trip is hidden from
  // members who didn't come (managers always see the trips they record).
  const viewerId = session.user.id;
  // While previewing, the viewer's own attendance is dropped as well: the useful
  // question is what a member who WASN'T on the trip sees, which is the narrowest
  // view the roster gets. An owner who attended would otherwise still see an
  // attendees-only trip and conclude the whole club can.
  const canSeeTrip = (t: ClubTrip) =>
    t.visibility === "club" ||
    manages ||
    (!previewing && t.attendees.some((a) => a.userId === viewerId));
  const visibleCurrent = currentTrip && canSeeTrip(currentTrip) ? currentTrip : null;
  const visiblePast = pastTrips.filter(canSeeTrip);

  // Thumbnails for the past-trip cards. Looked up only for the trips this viewer
  // can actually see, so a hidden trip's photo url never reaches the page.
  const covers = await firstPhotoByTrip(
    visiblePast.map((t) => t.id),
    pool
  );

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
          <div className={styles.heroBadges}>
            {previewing && <span className={styles.previewPill}>Viewing as member</span>}
            {!club.isPublic && <span className={styles.privacyPill}>Private</span>}
            {isManager &&
              (previewing ? (
                <Link href={`/clubs/${club.slug}`} className={styles.previewExit}>
                  Exit preview
                </Link>
              ) : (
                <Link href={`/clubs/${club.slug}?preview=member`} className={styles.previewLink}>
                  Preview page
                </Link>
              ))}
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        <main className={styles.main}>
          <section>
            <h2 className={styles.sectionTitle}>Next trip</h2>
            {visibleCurrent ? (
              <TripCard trip={visibleCurrent} slug={club.slug} manages={manages} featured />
            ) : (
              <div className={styles.empty}>
                <p className={styles.emptyText}>
                  {manages
                    ? "No trip in the works. Shortlist some destinations and let the club vote on them."
                    : "No trip in the works yet. An admin will put one to a vote."}
                </p>
                {manages && (
                  <Link href={`/plan?club=${club.slug}&page=1`} className={styles.emptyAction}>
                    Propose a trip
                  </Link>
                )}
              </div>
            )}
          </section>

          <section>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitleBare}>Previous trips</h2>
              {manages && <AddPastTrip slug={club.slug} trips={tripsCatalog} />}
            </div>
            {visiblePast.length ? (
              visiblePast.map((t) => (
                <TripCard
                  key={t.id}
                  trip={t}
                  slug={club.slug}
                  manages={manages}
                  coverUrl={covers.get(t.id) ?? null}
                />
              ))
            ) : (
              <div className={styles.empty}>
                <p className={styles.emptyText}>
                  {manages
                    ? "No trips here yet. Finish a vote, or add a trip the club has already taken."
                    : "No trips played yet. Once you finish one, it lands here with photos, results, and who came."}
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
