import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canView, canManage, listMembers } from "@/lib/clubs";
import { getClubTripById, listTripPhotos } from "@/lib/clubTrips";
import { getPublishedTripFull, getPublishedTrips, getAllCoursesForPicker } from "@/lib/airtable";
import TripCoursesEditor from "@/components/TripCoursesEditor";
import TripDestinationPicker from "@/components/TripDestinationPicker";
import TripAttendeesEditor from "@/components/TripAttendeesEditor";
import TripPhotos from "@/components/TripPhotos";
import styles from "@/styles/tripDetail.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trip",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  live: "On the trip",
  completed: "Played",
  archived: "Shelved",
  voting: "Voting",
  draft: "Draft",
};

/**
 * The courses + golf side trips tied to a trip's destination, as picker options.
 * Empty for a manual trip (its chosen_destination is free text, not a slug) or
 * anything else Airtable can't resolve — the editor falls back to manual entry.
 */
async function tripCourseOptions(destinationSlug: string | null): Promise<{ slug: string; name: string }[]> {
  if (!destinationSlug) return [];
  try {
    const full = await getPublishedTripFull(destinationSlug);
    if (!full) return [];
    const raw = [
      ...full.courses.map((c) => ({ slug: c.course.slug, name: c.course.name })),
      ...full.sideTrips.filter((s) => s.isGolf).map((s) => ({ slug: s.slug, name: s.name })),
    ];
    const seen = new Set<string>();
    return raw.filter((o) => {
      const k = o.name.toLowerCase();
      if (!o.name || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch {
    return [];
  }
}

/** Month/year label for the trip's dates, e.g. "Sep 2023" or "Sep – Oct 2023". */
function formatTripDates(start: Date | null, end: Date | null): string | null {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  const s = start.toLocaleDateString("en-US", opts);
  if (!end) return s;
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  return sameMonth ? s : `${s} – ${end.toLocaleDateString("en-US", opts)}`;
}

export default async function TripDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tripId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ slug, tripId }, sp] = await Promise.all([params, searchParams]);
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/register?callbackUrl=/clubs/${encodeURIComponent(slug)}/trips/${encodeURIComponent(tripId)}`);
  }

  const pool = getPgPool();
  const club = await getClubBySlug(slug, pool);
  if (!club) notFound();

  const viewer = await getClubViewer(club.id, session.user.id, pool);
  // Member-only: a non-member gets the same notFound as a stranger — the trip
  // detail (including the recap) is never shown outside the roster.
  if (!canView(viewer)) notFound();

  if (!UUID_RE.test(tripId)) notFound();
  const trip = await getClubTripById(club.id, tripId, pool);
  if (!trip) notFound();

  const manages = canManage(viewer);
  // Everyone — captains and admins included — gets the read-only view by default.
  // Editing is opt-in via ?edit=1, reachable only through the manager's Edit button.
  const editing = manages && sp?.edit === "1";

  // Per-trip visibility. 'attendees' hides the trip from members who didn't come
  // (managers always see it, since they record it). Same notFound as a stranger,
  // so a restricted trip doesn't even confirm it exists to a non-attendee.
  const isAttendee = trip.attendees.some((a) => a.userId === session.user!.id);
  if (trip.visibility === "attendees" && !manages && !isAttendee) notFound();

  // The editors' data — roster (attendee toggles), the trips catalog (destination
  // link), and the course catalog — is only needed in edit mode, so skip these
  // Airtable/DB calls entirely for the default read-only view.
  const [roster, tripsCatalog, courseCatalog] = await Promise.all([
    editing
      ? listMembers(club.id, pool).then((ms) =>
          ms
            .filter((m) => m.status === "active" && m.userId)
            .map((m) => ({ userId: m.userId as string, name: m.name?.trim() || m.email.split("@")[0] }))
        )
      : Promise.resolve([]),
    editing
      ? getPublishedTrips().then((ts) => ts.map((t) => ({ slug: t.slug, name: t.name })))
      : Promise.resolve([] as { slug: string; name: string }[]),
    editing ? getAllCoursesForPicker() : Promise.resolve([] as { slug: string; name: string; state?: string }[]),
  ]);

  // Photos are shown to everyone who can see the trip, managers or not.
  const photos = await listTripPhotos(trip.id, pool);

  // The destination that drives the course dropdown: an explicit link if set,
  // else a voted winner (chosen_destination is already a real slug). A manual
  // trip's free-text chosen_destination resolves to nothing until it's linked.
  const knownSlugs = new Set(tripsCatalog.map((t) => t.slug));
  const effectiveSlug =
    trip.destinationSlug ||
    (trip.chosenDestination && knownSlugs.has(trip.chosenDestination) ? trip.chosenDestination : null);
  const linkedName = effectiveSlug ? tripsCatalog.find((t) => t.slug === effectiveSlug)?.name ?? null : null;
  const courseOptions = editing && effectiveSlug ? await tripCourseOptions(effectiveSlug) : [];

  const heading = trip.title || trip.chosenDestination || "Trip";
  const dateLabel = formatTripDates(trip.startDate, trip.endDate);

  return (
    <main className={styles.page}>
      <Link href={`/clubs/${club.slug}`} className={styles.back}>← {club.name}</Link>

      <header className={styles.header}>
        <div className={styles.headLeft}>
          <div className={styles.headMeta}>
            <span className={styles.statusPill}>{STATUS_LABEL[trip.status] ?? trip.status}</span>
            {dateLabel && <span className={styles.headDate}>{dateLabel}</span>}
          </div>
          <h1 className={styles.title}>{heading}</h1>
        </div>
        {manages && (
          editing ? (
            <Link href={`/clubs/${club.slug}/trips/${trip.id}`} className={styles.doneBtn}>Done</Link>
          ) : (
            <Link href={`/clubs/${club.slug}/trips/${trip.id}?edit=1`} className={styles.editBtn}>
              Edit trip
            </Link>
          )
        )}
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Courses played</h2>
        {editing && (
          <TripDestinationPicker
            slug={club.slug}
            tripId={trip.id}
            trips={tripsCatalog}
            linkedSlug={trip.destinationSlug}
            linkedName={linkedName}
          />
        )}
        <TripCoursesEditor
          slug={club.slug}
          tripId={trip.id}
          initialCourses={trip.courses}
          options={courseOptions}
          catalog={courseCatalog}
          canEdit={editing}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Who came</h2>
          {trip.visibility === "attendees" && (
            <span className={styles.visTag}>Attendees only</span>
          )}
        </div>
        <TripAttendeesEditor
          slug={club.slug}
          tripId={trip.id}
          initialAttendees={trip.attendees}
          initialVisibility={trip.visibility}
          roster={roster}
          canEdit={editing}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Photos</h2>
        <TripPhotos
          slug={club.slug}
          tripId={trip.id}
          initialPhotos={photos}
          canEdit={editing}
        />
      </section>
    </main>
  );
}
