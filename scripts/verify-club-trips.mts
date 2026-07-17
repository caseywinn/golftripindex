// End-to-end exercise of step 2 against the REAL database, through the REAL app
// code. Creates throwaway clubs, runs full cycles, deletes everything after.
//
// The previous version of this harness set club_trips.status = 'completed' with
// raw SQL and then asserted the club could propose again — manufacturing the
// exact state it was verifying, while NO shipped code path could produce it. The
// lifecycle is now driven only through setClubTripStatus, so if the transition
// doesn't exist, this fails.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getPgPool } from "@/lib/db";
import {
  createClubTrip, getCurrentClubTrip, listPastClubTrips, setClubTripStatus,
} from "@/lib/clubTrips";
import { buildPollView, loadPoll, castBallot, closePoll } from "@/lib/planPoll";
import { defaultVoteConfig } from "@/lib/planVote";
import { createBracket } from "@/lib/planBracket";
import type { PollDest } from "@/lib/planPoll";

const pool = getPgPool();
let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${msg}`);
};

const DESTS: PollDest[] = [
  { slug: "bandon-dunes", name: "Bandon Dunes", overallRating: 9.6, costTier: 4 },
  { slug: "pinehurst", name: "Pinehurst", overallRating: 9.1, costTier: 3 },
  { slug: "streamsong", name: "Streamsong", overallRating: 8.7, costTier: 3 },
];

const stamp = Date.now();
const made: { users: string[]; clubs: string[] } = { users: [], clubs: [] };

async function mkUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e-${stamp}-${tag}@example.test`;
  const { rows } = await pool.query(`INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`, [tag, email]);
  made.users.push(rows[0].id);
  return { id: String(rows[0].id), email };
}

async function mkClub(tag: string, ownerId: string): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO clubs (name, slug, owner_id, tier, seat_limit) VALUES ($1, $2, $3, 'small', 12) RETURNING id`,
    [`E2E ${tag}`, `e2e-${tag}-${stamp}`, ownerId]
  );
  made.clubs.push(String(rows[0].id));
  return String(rows[0].id);
}

async function addMember(clubId: string, u: { id: string; email: string }, role: string) {
  await pool.query(
    `INSERT INTO club_members (club_id, email, user_id, role, status, joined_at)
     VALUES ($1, $2, $3, $4, 'active', now())`,
    [clubId, u.email, u.id, role]
  );
}

const propose = (clubId: string, by: { id: string }, type: "approval" | "bracket" = "approval", dests = DESTS) => {
  // Mirrors app/api/clubs/[slug]/trips/route.ts: the route seeds the bracket
  // structure up front so round 1 is ready, exactly as /api/plan/share does.
  const vote = defaultVoteConfig(type);
  if (vote.type === "bracket") vote.bracket = createBracket(dests.map((d) => d.slug));
  return createClubTrip({
    clubId, createdBy: by.id, createdByName: "Proposer", title: "Fall 2026",
    destinations: dests, vote, golfers: 8, nights: 3, when: null,
  }, pool);
};

try {
  // ══ Cycle A: the full happy path, lifecycle driven by real code ═══════════
  console.log("\n══ A. propose → vote → win → play → propose again ══");
  const owner = await mkUser("owner");
  const admin = await mkUser("admin");
  const member = await mkUser("member");
  const outsider = await mkUser("outsider");
  const clubA = await mkClub("a", owner.id);
  for (const [u, r] of [[owner, "owner"], [admin, "admin"], [member, "member"]] as const) await addMember(clubA, u, r);
  // Neither of these may be seated: suspended can't act, and an unclaimed invite
  // has no user_id so it could never vote — seating it would hang the poll open.
  await addMember(clubA, await mkUser("susp"), "member");
  await pool.query(`UPDATE club_members SET status='suspended' WHERE club_id=$1 AND email LIKE '%susp%'`, [clubA]);
  await pool.query(`INSERT INTO club_members (club_id, email, role, status) VALUES ($1,$2,'member','invited')`,
    [clubA, `e2e-${stamp}-inv@example.test`]);

  const a = await propose(clubA, admin);
  check(a.ok, "admin proposes");
  if (!a.ok) throw new Error(a.error);

  const { rows: seats } = await pool.query(
    `SELECT user_id, is_captain FROM trip_poll_voters WHERE shared_trip_id = $1`, [a.pollId]);
  check(seats.length === 3, `3 active members seated (got ${seats.length}) — suspended + unclaimed excluded`);
  check(seats.every((r) => r.user_id), "every seat pre-bound to a user_id");

  const dupe = await propose(clubA, owner);
  check(!dupe.ok && dupe.status === 409, "a second open trip is refused (409)");

  // ── Privacy: a club poll is club-private ────────────────────────────────
  console.log("\n── club poll privacy ─────────────────────────────");
  const anon = await loadPoll(a.pollId, { userId: null, email: null }, pool);
  check(!anon.ok && anon.reason === "login", "a LOGGED-OUT viewer is sent to sign in, not shown the roster");
  const stranger = await loadPoll(a.pollId, { userId: outsider.id, email: outsider.email }, pool);
  check(!stranger.ok && stranger.reason === "notfound", "a NON-MEMBER gets 404 — no club name, no roster");
  check((await buildPollView(a.pollId, { userId: outsider.id, email: outsider.email }, pool)) === null,
    "buildPollView itself withholds it (the poll API can't bypass the gate)");
  const memberLoad = await loadPoll(a.pollId, { userId: member.id, email: member.email }, pool);
  check(memberLoad.ok, "a member loads it fine");
  check(memberLoad.ok && memberLoad.view.voters.length === 3, "…and sees the roster");

  // ── Captain rights come from club role ──────────────────────────────────
  console.log("\n── captain rights ────────────────────────────────");
  const ownerView = await buildPollView(a.pollId, { userId: owner.id, email: owner.email }, pool);
  check(!!ownerView?.viewer.isCaptain, "the OWNER can close a trip the ADMIN proposed");
  const memberView = await buildPollView(a.pollId, { userId: member.id, email: member.email }, pool);
  check(!memberView?.viewer.isCaptain, "a plain member cannot close");
  const memberClose = await closePoll(a.pollId, { userId: member.id, email: member.email });
  check(!memberClose.ok && memberClose.status === 403, "…and is refused (403) if they try");
  const outVote = await castBallot(a.pollId, { userId: outsider.id, email: outsider.email }, { approve: ["pinehurst"] });
  check(!outVote.ok && outVote.status === 404, "a non-member's ballot is refused");

  // A demoted admin must lose the right to close, even though they proposed it.
  await pool.query(`UPDATE club_members SET role='member' WHERE club_id=$1 AND user_id=$2`, [clubA, admin.id]);
  const demotedView = await buildPollView(a.pollId, { userId: admin.id, email: admin.email }, pool);
  check(!demotedView?.viewer.isCaptain, "the DEMOTED proposer loses captain rights (user_id confers nothing)");
  const demotedClose = await closePoll(a.pollId, { userId: admin.id, email: admin.email });
  check(!demotedClose.ok && demotedClose.status === 403, "…and cannot force the vote closed");
  await pool.query(`UPDATE club_members SET role='admin' WHERE club_id=$1 AND user_id=$2`, [clubA, admin.id]);

  // A member removed from the club keeps a poll seat, but must not vote.
  await pool.query(`UPDATE club_members SET status='removed' WHERE club_id=$1 AND user_id=$2`, [clubA, member.id]);
  const removedVote = await castBallot(a.pollId, { userId: member.id, email: member.email }, { approve: ["pinehurst"] });
  check(!removedVote.ok && removedVote.status === 404, "a REMOVED member can't vote, though their seat remains");
  await pool.query(`UPDATE club_members SET status='active' WHERE club_id=$1 AND user_id=$2`, [clubA, member.id]);

  // ── Vote → auto-close → winner locked ───────────────────────────────────
  console.log("\n── vote + auto-close + lock ──────────────────────");
  const v1 = await castBallot(a.pollId, { userId: owner.id, email: owner.email }, { approve: ["bandon-dunes", "pinehurst"] });
  check(v1.ok && v1.view.results === null, "standings stay hidden while open");
  let trip = await getCurrentClubTrip(clubA, pool);
  check(trip?.roster.voted === 1 && trip?.roster.size === 3, `turnout 1/3 (got ${trip?.roster.voted}/${trip?.roster.size})`);

  await castBallot(a.pollId, { userId: admin.id, email: admin.email }, { approve: ["bandon-dunes"] });
  const v3 = await castBallot(a.pollId, { userId: member.id, email: member.email }, { approve: ["bandon-dunes", "streamsong"] });
  check(v3.ok && v3.view.vote?.status === "closed", "auto-closes on the last ballot");
  trip = await getCurrentClubTrip(clubA, pool);
  check(trip?.chosenDestination === "bandon-dunes" && trip?.status === "planning",
    `winner locked + VOTING → PLANNING (got ${trip?.chosenDestination}/${trip?.status})`);

  await pool.query(`DELETE FROM trip_poll_ballots WHERE shared_trip_id = $1`, [a.pollId]);
  check((await getCurrentClubTrip(clubA, pool))?.chosenDestination === "bandon-dunes",
    "the winner survives the ballots being deleted");

  // ── The lifecycle, via REAL code only ───────────────────────────────────
  console.log("\n── lifecycle (no hand-written SQL) ───────────────");
  const blocked = await propose(clubA, owner);
  check(!blocked.ok && blocked.status === 409, "a trip in PLANNING still blocks new proposals");

  const played = await setClubTripStatus(clubA, trip!.id, "complete", pool);
  check(played.ok, "an admin can mark a planned trip PLAYED (this transition must exist in code)");
  check((await getCurrentClubTrip(clubA, pool)) === null, "…which clears the Next trip slot");
  const past = await listPastClubTrips(clubA, pool);
  check(past.length === 1 && past[0].chosenDestination === "bandon-dunes", "…and fills Previous trips");
  const again = await propose(clubA, admin);
  check(again.ok, "…and frees the club to propose again — a club is NOT a one-shot");

  // ── Shelving is the escape hatch ────────────────────────────────────────
  console.log("\n── shelve ────────────────────────────────────────");
  if (again.ok) {
    const shelved = await setClubTripStatus(clubA, again.tripId, "archive", pool);
    check(shelved.ok, "an admin can shelve a trip that's still VOTING");
    check((await getCurrentClubTrip(clubA, pool)) === null, "…freeing the club immediately");
  }
  const otherOwner = await mkUser("otherowner");
  const clubB = await mkClub("b", otherOwner.id);
  await addMember(clubB, otherOwner, "owner");
  const bTrip = await propose(clubB, otherOwner);
  if (bTrip.ok) {
    const crossClub = await setClubTripStatus(clubA, bTrip.tripId, "archive", pool);
    check(!crossClub.ok, "an admin of club A CANNOT shelve club B's trip (scoped by club_id)");
    check((await getCurrentClubTrip(clubB, pool)) !== null, "…and B's trip is untouched");
  }

  // ══ Cycle B: a tie must not silently pick a winner ════════════════════════
  console.log("\n══ B. ties ══════════════════════════════════════════");
  const o2 = await mkUser("o2");
  const m2 = await mkUser("m2");
  const clubC = await mkClub("c", o2.id);
  await addMember(clubC, o2, "owner");
  await addMember(clubC, m2, "member");
  const tie = await propose(clubC, o2);
  if (tie.ok) {
    await castBallot(tie.pollId, { userId: o2.id, email: o2.email }, { approve: ["bandon-dunes"] });
    await castBallot(tie.pollId, { userId: m2.id, email: m2.email }, { approve: ["pinehurst"] });
    const tieTrip = await getCurrentClubTrip(clubC, pool);
    check(tieTrip?.voteStatus === "closed", "a 1–1 approval tie closes the poll");
    check(tieTrip?.chosenDestination === null, "…and locks NO winner (a tie isn't resolved by sort order)");
    check(tieTrip?.status === "voting", "…leaving the trip in VOTING");
    const escape = await setClubTripStatus(clubC, tieTrip!.id, "archive", pool);
    check(escape.ok && (await getCurrentClubTrip(clubC, pool)) === null,
      "…and shelving is the escape hatch, so a tie can't brick the club");
  }

  // A bracket tie is resolved by SEED, and seeds are a random shuffle — so
  // champion() alone would commit the club to a coin flip. Must not lock.
  const o3 = await mkUser("o3");
  const m3 = await mkUser("m3");
  const clubD = await mkClub("d", o3.id);
  await addMember(clubD, o3, "owner");
  await addMember(clubD, m3, "member");
  const br = await propose(clubD, o3, "bracket", DESTS.slice(0, 2));
  if (br.ok) {
    const view = await buildPollView(br.pollId, { userId: o3.id, email: o3.email }, pool);
    const bracket = view!.vote!.bracket as { matchups: { id: string; a: string | null; b: string | null }[] };
    const final = bracket.matchups.find((m) => m.a && m.b)!;
    await castBallot(br.pollId, { userId: o3.id, email: o3.email }, { picks: { [final.id]: final.a } });
    await castBallot(br.pollId, { userId: m3.id, email: m3.email }, { picks: { [final.id]: final.b } });
    const brTrip = await getCurrentClubTrip(clubD, pool);
    check(brTrip?.voteStatus === "closed", "a 1–1 bracket final closes the poll");
    check(brTrip?.chosenDestination === null,
      `…and locks NO winner despite champion() naming one by random seed (got ${brTrip?.chosenDestination})`);
  }

  // Closing a fresh bracket with zero ballots must not crown a random winner.
  const o4 = await mkUser("o4");
  const clubE = await mkClub("e", o4.id);
  await addMember(clubE, o4, "owner");
  const empty = await propose(clubE, o4, "bracket", DESTS.slice(0, 2));
  if (empty.ok) {
    await closePoll(empty.pollId, { userId: o4.id, email: o4.email });
    const emptyTrip = await getCurrentClubTrip(clubE, pool);
    check(emptyTrip?.chosenDestination === null,
      `closing a bracket with ZERO ballots locks no winner (got ${emptyTrip?.chosenDestination})`);
  }

  // ══ Regression: plain /plan shares still work ═════════════════════════════
  console.log("\n══ C. /plan shares unaffected ═══════════════════════");
  const solo = await mkUser("solo");
  const { rows: sh } = await pool.query(
    `INSERT INTO shared_trips (user_id, state) VALUES ($1, $2::jsonb) RETURNING id`,
    [solo.id, JSON.stringify({ destinations: DESTS, vote: defaultVoteConfig("approval"), sharedBy: "Solo" })]
  );
  await pool.query(`INSERT INTO trip_poll_voters (shared_trip_id, email, user_id, is_captain) VALUES ($1,$2,$3,true)`,
    [sh[0].id, solo.email, solo.id]);
  const pub = await loadPoll(sh[0].id, { userId: null, email: null }, pool);
  check(pub.ok, "a /plan share is still PUBLIC to a logged-out viewer (not gated by the club check)");
  check(pub.ok && pub.view.club === null, "…and carries no club context");
  const soloView = await buildPollView(sh[0].id, { userId: solo.id, email: solo.email }, pool);
  check(!!soloView?.viewer.isCaptain, "…and its creator is still its captain");
  const strangerClose = await closePoll(sh[0].id, { userId: outsider.id, email: outsider.email });
  check(!strangerClose.ok && strangerClose.status === 403, "…and a stranger still can't close it");
} catch (err) {
  failures++;
  console.error("\n UNEXPECTED ERROR:", err);
} finally {
  console.log("\n── cleanup ───────────────────────────────────────");
  for (const c of made.clubs) await pool.query(`DELETE FROM clubs WHERE id = $1`, [c]);
  await pool.query(`DELETE FROM shared_trips WHERE user_id = ANY($1)`, [made.users]);
  for (const u of made.users) await pool.query(`DELETE FROM users WHERE id = $1`, [u]).catch((e) => {
    failures++; console.error(`  LEFTOVER user ${u}: ${e.message}`);
  });
  const { rows: left } = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM clubs WHERE slug LIKE 'e2e-%') AS clubs,
            (SELECT COUNT(*)::int FROM users WHERE email LIKE 'e2e-%@example.test') AS users,
            (SELECT COUNT(*)::int FROM club_trips) AS trips_total`
  );
  console.log(`  ${left[0].clubs} test clubs / ${left[0].users} test users remain; club_trips rows in DB: ${left[0].trips_total}`);
  if (left[0].clubs || left[0].users) failures++;
  await pool.end();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
