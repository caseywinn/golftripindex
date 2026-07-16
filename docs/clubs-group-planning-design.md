# Clubs: Group Planning Tool + Photojournal — Design

**Status:** Design agreed, not yet built · **Date:** 2026-07-15

## Business context

Golf Trip Index currently serves small guy-groups (ad-hoc trip shortlists + one-off
group votes). This adds a second target: **larger standing groups** — men's clubs at
courses being the prototypical customer.

Each club gets:
- Its own **landing page** (a shared analog of `/bag`).
- **Member management**: invite, remove, suspend.
- A **trip lifecycle**: propose → vote → plan (opt in/out) → play → archive.
- A **photojournal** of Previous Trips (currently "Played"): location, courses, dates,
  attendees, winners/losers, and hosted photos.

So a club page is a *group planning tool + group photojournal*.

**Why it matters:** clubs are the B2B revenue thesis (a men's club pays); the
photojournal is the retention engine that keeps a club active between trips.

## Decisions (agreed)

| Question | Decision | Consequence |
|---|---|---|
| Business model | **Seat-band pricing, architect for paid now** | Individual = free (existing `/bag`+`/plan`). Small group = tier 1, large group = tier 2 (pricier). `clubs.tier` + `clubs.seat_limit` are the billing spine; **enforcement point is invite time** (can't add member past seat limit → upgrade). Verification/branding is NOT the paywall — seats are |
| Member identity | **Require registration** (no anonymous/email-only path) | Every seat = a real registered user (clean per-seat billing). Deletes the scoped-token / NextAuth-email-adapter infra entirely. Invite creates a pending `club_members` row (`status='invited'`, `user_id` null); registration with matching email flips to `active` + binds `user_id` (same bind-on-login pattern as `trip_poll_voters`) |
| Invite flow | **Frictionless invite → register → bind is critical** | Since there's no anonymous path, adoption hinges on this: invite email deep-links to pre-filled registration carrying the pending-membership token; push Google one-click as primary CTA |
| Privacy / discovery | **Private + noindex by default, public opt-in** | Clubs default invite-only like `/bag`; public profile is an opt-in feature (SEO value mostly for larger/established clubs) |
| Results tracking | **Freeform for now** | `recap` text + attendees (real member refs) + photos; no scorecard subsystem. Structured leaderboard is a clean future add |
| Voting | **Reuse `/plan` poll engine, scoped to club** | Add `club_trip_id` to `shared_trips`; roster seeded from active members. One voting codebase |

**Free/paid boundary — decided (2026-07-16):** **free is strictly solo.** Solo planning
(`/bag`, solo `/plan`) is free forever. The moment planning involves a group, it's paid:
tier 1 = small groups, tier 2 = larger groups. Sharing is a paid capability, not a free
funnel.

Consequences to handle at build time:
- Existing free `/plan` group shares are now a paid capability. Needs an explicit call:
  grandfather live shares, or convert them into a time-boxed trial. Not a schema
  question — a migration/comms question, but it can't be skipped silently.
- The funnel has to come from somewhere other than free sharing (editorial/SEO,
  the public club opt-in, solo `/bag`).

## ~~BLOCKER~~ FIXED 2026-07-16: Google sign-in had no `users` row

**Resolved.** See "Step 0" below for what shipped. The section is kept because it explains
*why* the fix looks the way it does. Original diagnosis follows.

Verified in code on 2026-07-16. **The premise "every seat = a real registered user" was
false**, and the break was exactly on the path the doc wants to push hardest
(Google one-click).

The facts, all confirmed:
- `auth.ts` configures NextAuth with **no adapter** and **no `signIn`/`jwt` callback** —
  only a `session` callback that copies `token.sub` → `session.user.id`.
- The **only** `INSERT INTO users` in the entire repo is `app/api/auth/register/route.ts`
  (the credentials path). Google sign-in *never writes a `users` row*.
- So `session.user.id` is **provider-dependent**: a real `users.id` for credentials,
  and Google's opaque subject string for Google. A Google user exists only as a JWT.

Consequences that land directly on this design:
1. **Seat billing can't count Google members.** `club_members.user_id` would hold a
   Google sub pointing at no `users` row. Per-seat billing keyed to registered users
   silently misses every Google member.
2. **Same human = two identities.** Register with email/password, later "Sign in with
   Google" on the same address → two different `session.user.id` values → two disjoint
   `/bag` collections, and two seats consumed in a club.
3. **Already degrading in prod.** `lib/planPoll.ts:115` does
   `LEFT JOIN users u ON u.id::text = v.user_id`; for Google voters this joins to
   nothing, so the roster silently falls back to `labelFromEmail` instead of their name.
   The bug is live today, just cosmetic so far.
4. `users.id` is **`uuid NOT NULL DEFAULT gen_random_uuid()`** (verified against the live
   DB 2026-07-16), while every other table stores `user_id TEXT` with no FK. That's why
   this has stayed invisible: nothing referentially enforces it.

### Live DB findings (verified 2026-07-16, read-only)

Actual `users` DDL — note there is no `image`/`avatar` column, so a Google profile picture
has nowhere to go:

| column | type | nullable | default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | — |
| `email` | `text` | NO | — |
| `password_hash` | `text` | **NO** | — |
| `created_at` | `timestamptz` | NO | `now()` |

**`password_hash` is NOT NULL — this is a hard blocker for step 0.** The resolve-or-create
upsert for Google users writes no password and would violate the constraint. `ALTER TABLE
users ALTER COLUMN password_hash DROP NOT NULL;` is a required prerequisite. Once nullable,
`auth.ts`'s credentials `authorize()` must also guard it: `bcrypt.compare(pw, null)`
rejects, but relying on that is accidental — add an explicit `if (!user.password_hash)
return null` so a Google-only account can't be probed via the password form.

**Nobody has used Google sign-in. The backfill problem does not exist.** Zero rows in
`user_items`, `shared_trips`, or `trip_poll_voters` have a Google-subject-shaped `user_id`
(all values are uuid-shaped; Google subs are ~21-digit numerics). Step 0 is a **pure code
fix with no data migration** — do it now, while it's free. This is the single most
valuable thing found: the fix gets strictly more expensive with every Google user.

Scale is tiny — 6 users, 25 `user_items`, 11 `shared_trips`. Effectively pre-launch, so
schema changes are cheap right now.

**But the no-FK convention is already rotting data.** Two orphaned `user_id` values exist —
uuid-shaped, pointing at `users` rows that no longer exist (not Google, just deleted and
re-registered accounts):
- `user_items`: 2 rows under `9c45f251-…`, a user that's gone.
- `trip_poll_voters`: the **captain seat** for `caseywinn@gmail.com` is bound to
  `13f599a5-…`, which is *not* that account's current `users.id` (`bde8b4a5-…`). That poll
  has a captain who no longer resolves.

Nothing cleans these up because there's no FK. For clubs this stops being cosmetic: an
orphaned `club_members` row is a **seat that bills for a user who doesn't exist**. See the
schema section — this changes the `user_id` type recommendation.

**Fix (prerequisite step 0):** add a `signIn`/`jwt` callback that resolves-or-creates a
`users` row by lowercased email, and normalize `token.sub` to that local `users.id` so
identity is provider-independent. Needs `users.password_hash` to be **nullable** for
Google users — unverified, since the `users` DDL is not in the repo (created out-of-band;
`enable_rls.sql` only bolts RLS onto it).

**Also needs a backfill decision:** existing Google users already have `user_items` /
`shared_trips` rows keyed by Google sub. Remapping `token.sub` to a local `users.id`
orphans that data unless it's migrated. This is the one genuinely risky migration here —
it touches live user data.

## What already exists (reuse)

| Capability | Today | Reuse |
|---|---|---|
| Identity/auth | NextAuth v5, `users` (id/name/email/password_hash), Google + credentials (`auth.ts`) | As-is |
| Personal landing page | `/bag`, login-gated, `user_items`, `BagCarousels` (`app/bag/page.tsx`) | Template for club page |
| Invite-by-email → bind on login | `trip_poll_voters` (email seat claimed on login, `lib/planPoll.ts`) | The membership pattern |
| Proposal + group vote | `shared_trips` (JSONB) + approval/ranked/bracket (`lib/planPoll`, `planBracket`, `planVoteEngine`) | Scope to a club |
| Save/status toggle | `SaveButton` + `user_items` upsert | Club-scoped variant |

## What's genuinely new

1. **A persistent group entity.** Everything today is per-user (`user_items`) or
   per-share (`shared_trips`). A club is a long-lived owner of members + history.
2. **RSVP / opt-in-out.** The roster tracks *who was invited to vote* and *whether they
   voted* — nothing tracks *who's actually coming*. Separate phase from voting.
3. **A "this trip really happened" record + photojournal.** A closed poll doesn't even
   persist the winning destination today (results re-derived from ballots). Completed
   trips, attendees, results, and photos are all new objects.

## The spine: trip lifecycle state machine

```
DRAFT → VOTING → PLANNING → LIVE → COMPLETED → ARCHIVED
        (poll)   (opt in/   (trip  (results +   (photojournal)
                  out, $$)   dates)  photos)
```

- **VOTING** reuses the existing poll engine, roster = active club members.
- **PLANNING** is the new RSVP phase: winner locked, members opt in/out, real headcount.
- **COMPLETED/ARCHIVED** is the photojournal.

All of it lives in **Supabase**, referencing Airtable only for course/trip *content* IDs
(names, images) — consistent with the existing CMS/app-state split.

## Data model (Supabase, proposed)

> `clubs` and `club_members` are **superseded by the Step 1 detailed design below**, which
> has the real DDL. The sketches here are kept for the trip/photo tables (steps 2–4),
> which haven't been designed in detail yet.

- `clubs` — `id`, `name`, `slug`, `home_course`, `owner_id`, `tier`
  (`small`/`large`; individual is not a club — that's free `/bag`), `seat_limit`
  (derived from tier; billing spine, enforced at invite time), `is_public`
  (default false), `settings`, `created_at`
- `club_members` — `club_id`, `user_id` (nullable until registered), `email`, `role`
  (`owner`/`admin`/`member`), `status` (`invited`/`active`/`suspended`/`removed`),
  `invited_at`. Row created at invite as `status='invited'`, `user_id` null;
  registration with matching email flips to `active` + binds `user_id`.
  Generalizes `trip_poll_voters`.
- `club_trips` — `id`, `club_id`, `status` (state machine), `shared_trip_id` (the vote),
  `chosen_destination`, `start_date`, `end_date`
- `club_trip_rsvps` — `trip_id`, `member_id`, `status` (`in`/`out`/`maybe`)
- `club_trip_results` — `trip_id`, `recap`, `attendees` (member refs), winners/losers
- `club_trip_photos` — `trip_id`, Supabase Storage refs, uploaded_by

`shared_trips` gains a nullable `club_trip_id` to link a poll back to its club trip.

## Build sequence (each independently shippable)

1. **Clubs + membership** — `clubs`, `club_members`, `/clubs/[slug]` page (fork of
   `/bag`), invite/remove/suspend. Usable on its own: a group with a home.
2. **Propose → vote** — "Create a trip" on the club page hands off to the existing poll,
   scoped to the roster. Smallest new code.
3. **Plan → RSVP** — winner locks, `club_trip_rsvps` opt-in/out, live headcount. The
   genuinely new interaction.
4. **Previous Trips + photojournal** — mark COMPLETED, freeform recap + attendees +
   photo upload (Supabase Storage), archive view. Last, because it depends on a real
   completed trip existing.

---

# Step 1 detailed design: Clubs + membership

Designed 2026-07-16 against the real code. Ships as: *a group has a home page, an owner
can invite/remove/suspend, invitees register and land on the roster.* No trips yet.

## Step 0 (prerequisite): normalize identity — ✅ SHIPPED 2026-07-16

`session.user.id` now means the same thing for every provider. Step 1 is unblocked.

**What shipped:**
- `migrations/add_oauth_users.sql` — **applied to prod.** Drops `NOT NULL` on
  `users.password_hash` (OAuth accounts have no password) and asserts the
  `UNIQUE (email)` constraint the upsert's `ON CONFLICT` depends on.
- `lib/users.ts` — `upsertUserByEmail()` (resolve-or-create, returns `users.id`) and
  `localUserIdByEmail()`.
- `auth.ts` — a `jwt` callback that pins `token.sub` to the local `users.id` on Google
  sign-in; a `signIn` callback rejecting Google emails without `email_verified === true`;
  and an explicit `if (!user.password_hash) return null` guard in credentials `authorize()`.

**Verified** against the live DB inside a rolled-back transaction (nothing persisted):
new Google user creates a row with NULL `password_hash` and returns a uuid; a repeat
sign-in returns the same id; and a Google sign-in on an address that already has a
password account **resolves to that same `users.id`** with name and password intact —
account linking works, no second identity. `tsc`, `next build`, and `eslint` all clean.

**Security note on the linking.** Because a Google sign-in adopts the existing row for
that address, an unverified provider email would be an account-takeover path. Hence
requiring `email_verified === true` explicitly rather than merely not-false. The rejection
path logs a warning — that's the thread to pull if a legitimate Google user is ever
refused.

**Known gap (minor, not blocking):** a Google-only user who later tries to register with a
password at the same address gets the register route's 409 "account already exists" and has
no way to set a password — they must keep using Google. Fine for now; a "set a password"
flow or a clearer 409 message would close it.

**Not done (deliberately out of scope):** the register route still does a non-atomic
SELECT-then-INSERT. It's now backed by a confirmed unique index, so the failure mode is a
500 rather than a duplicate account. Worth converting to `ON CONFLICT` when that file is
next touched.

One constraint this leaves for step 1: `users` has **no image/avatar column**, so Google
profile pictures have nowhere to land. Not a blocker — just don't design roster UI that
assumes avatars exist.

## Schema

Mirrors `trip_poll_voters` deliberately: **email is the identity, `user_id` is a nullable
attachment.** That inversion is what makes invites idempotent and bind-on-login work.

**One deliberate break from convention: `user_id` is `uuid REFERENCES users(id)`, not
TEXT.** Every existing table uses unconstrained TEXT, and I'd planned to match it — but
the live DB shows that convention has *already* produced two orphaned `user_id` values,
including a poll captain seat pointing at a deleted account. On `user_items` an orphan is
a lost wishlist. On `club_members` an orphan is **a seat that bills for a user who doesn't
exist**, and the roster is the billing spine. Since `users.id` is a clean `uuid` and the
DB is effectively pre-launch (6 users), the FK is nearly free here and worth the
inconsistency. `ON DELETE SET NULL` returns the row to the unclaimed-invite state rather
than destroying roster history.

```sql
-- migrations/add_clubs.sql

CREATE TABLE IF NOT EXISTS clubs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,          -- /clubs/[slug]
  home_course TEXT,                                 -- Airtable GolfCourses slug; content lives there
  owner_id    UUID        NOT NULL REFERENCES users(id),
  tier        TEXT        NOT NULL DEFAULT 'small'
                          CHECK (tier IN ('small', 'large')),
  seat_limit  INT         NOT NULL,                 -- denormalized from tier; enforced at invite
  is_public   BOOLEAN     NOT NULL DEFAULT false,   -- private + noindex by default
  settings    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clubs_owner_idx ON clubs (owner_id);

-- Roster. PK is (club_id, email) — email is the identity, user_id attaches on login.
-- Generalizes trip_poll_voters.
CREATE TABLE IF NOT EXISTS club_members (
  club_id    UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,                  -- always stored lowercased
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,  -- NULL = invite unclaimed
  role       TEXT        NOT NULL DEFAULT 'member'
                         CHECK (role IN ('owner', 'admin', 'member')),
  status     TEXT        NOT NULL DEFAULT 'invited'
                         CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),    -- doubles as roster sort order
  joined_at  TIMESTAMPTZ,                           -- set on bind; trip_poll_voters lacks this
  PRIMARY KEY (club_id, email)
);

CREATE INDEX IF NOT EXISTS club_members_user_idx  ON club_members (user_id);
CREATE INDEX IF NOT EXISTS club_members_email_idx ON club_members (lower(email));

-- App connects via the postgres/service role (bypasses RLS); enabling RLS with
-- no policies keeps these tables inaccessible to the anon/authenticated API roles.
ALTER TABLE clubs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;
```

Deltas from `trip_poll_voters`, each deliberate:
- **`joined_at`** — the poll roster can't tell when someone accepted, only that `user_id`
  is non-null. Clubs need it (member-since, and it's the audit trail for seat billing).
- **`role`** replaces `is_captain` — three-state, not boolean.
- **`status`** is new. The poll roster has no lifecycle; a club must suspend/remove.
  Note `removed` is a tombstone rather than a DELETE, so a removed member's history
  (RSVPs, photos, attendance) keeps resolving in later steps.
- **Functional index on `lower(email)`** — the poll table lacks one and relies on
  lowercasing at write time. We do both.
- **`user_id` FK** — see above; the one intentional break from the TEXT convention.

**Seats count `status IN ('invited','active')`** — a pending invite holds a seat, or you
could invite past your limit and have them all land at once. `suspended` and `removed` do
not count.

**Watch the `ON DELETE SET NULL` + `status` interaction.** If a user deletes their account,
the FK nulls `user_id` but leaves `status='active'` — a state the bind logic doesn't model
(it only claims rows that are `user_id IS NULL AND status='invited'`). That row is then a
seat that bills, can never be re-claimed, and shows an unresolvable member on the roster.
Either add a `CHECK (status != 'active' OR user_id IS NOT NULL)`, or have account deletion
explicitly set `status='removed'`. Worth deciding at build time — it's exactly the orphan
class already found in `trip_poll_voters`, just wearing a different hat.

## The bind: one unscoped UPDATE, in the auth callback

The existing `claimRosterSeat` is **scoped** — it needs a `shared_trip_id`, so it can only
bind the poll you're currently looking at. For clubs that's wrong: a member invited to a
club should be on the roster when they log in, not only if they happen to visit
`/clubs/[slug]` first. The whole club page depends on knowing who they are.

Since step 0 already puts a `signIn` callback in `auth.ts`, the bind goes there for free —
unscoped, covering every pending invite at once:

```ts
// lib/clubMembers.ts
export async function claimClubInvites(pool: pg.Pool, userId: string, email: string) {
  await pool.query(
    `UPDATE club_members
        SET user_id = $1, status = 'active', joined_at = now()
      WHERE lower(email) = lower($2)
        AND user_id IS NULL
        AND status = 'invited'`,
    [userId, email]
  );
}
```

- **`user_id IS NULL` is the security-critical clause** — carried over verbatim from
  `claimRosterSeat`. Without it, a second user with the same email steals a bound seat.
- **`status = 'invited'`** prevents a removed/suspended member from silently
  re-activating by logging in. `claimRosterSeat` has no analog; this is new and load-bearing.
- Idempotent, so it's safe to run on every sign-in.

The one open question here: **an invite to an email that doesn't match how they log in**
(invited at work address, signs in with personal Gmail) never binds. Same latent flaw the
poll roster has today. Acceptable for step 1 — the invite deep-link can pre-fill the
registration email, which makes the common path correct. Worth a "claim this invite"
fallback later.

## Invite → register → bind flow

The doc calls this critical for adoption, and it's mostly assembly of things that exist:

1. **Owner invites** `POST /api/clubs/[slug]/invite` → seat check → insert
   `club_members` row (`status='invited'`, `user_id` NULL) → send email.
   `ON CONFLICT (club_id, email) DO NOTHING` makes re-invite idempotent.
2. **Email** deep-links to `/register?callbackUrl=/clubs/[slug]&email=<invited>`.
   `/register` already reads `callbackUrl` and sanitizes it (`useSafeCallbackUrl` rejects
   anything not starting with `/`, and anything starting with `//`). **New work:** read
   `email` from search params and pre-fill the field. Google one-click is already there
   and already carries `callbackUrl`.
3. **They register or Google-sign-in** → step 0's `signIn` callback fires for *both*
   providers → `claimClubInvites` runs → seat flips to `active`.
4. **Redirect lands on `/clubs/[slug]`** — they're already on the roster, no side effects
   needed at render.

**Split invite from email-send.** In `/plan`, creating a roster seat is a side effect of
sending the email — same action, no separate endpoint. That's a bug we shouldn't copy: a
Resend failure currently still leaves a seat on the roster (and in the auto-close
denominator). For clubs, insert the row, then send; if the send fails, return the failure
and let the owner resend against the already-existing row.

## Seat enforcement

The billing spine. Enforced at exactly one point — invite time:

```sql
SELECT COUNT(*) FROM club_members
 WHERE club_id = $1 AND status IN ('invited', 'active');
```

`>= seat_limit` → 402 with an upgrade prompt. Do it in the same transaction as the insert
(`pool.connect()` — `lib/db.ts` exports only `getPgPool()`, there's no transaction helper),
or two concurrent invites both pass the check and overshoot the limit. This is the one
place in step 1 where a race actually costs money.

## Page + routes

`app/clubs/[slug]/page.tsx` — forks `app/bag/page.tsx`, which is a good template:
- `export const dynamic = "force-dynamic"` (per-user session read).
- `robots: { index: false, follow: false }` — matches "private + noindex by default".
  When `is_public` opt-in lands, this becomes conditional on the column.
- `auth()` → redirect to `/register?callbackUrl=/clubs/[slug]` if no session.
- **New gate `/bag` doesn't have:** membership check. Non-member → 404, not 403 — a 403
  confirms the club exists, which leaks the roster of a private club.
- Server-side `pool.query` for the roster, then Airtable for `home_course` content, joined
  in memory via a Map (the `/bag` hydration pattern).

Routes:
| Route | Purpose |
|---|---|
| `POST /api/clubs` | Create club; owner becomes `club_members` row `role='owner'`, `status='active'` |
| `POST /api/clubs/[slug]/invite` | Seat check → insert → email |
| `PATCH /api/clubs/[slug]/members/[email]` | Change role, suspend/reactivate |
| `DELETE /api/clubs/[slug]/members/[email]` | Set `status='removed'` (tombstone, not a DELETE) |

All mutations gate on `role IN ('owner','admin')` for the *calling* user. Guard rails:
an admin can't remove the owner; the owner can't remove themselves without transferring.

## Extract `lib/email.ts` first

There is no email abstraction — `app/api/share/route.ts` and
`app/api/plan/share/email/route.ts` each duplicate `getResend()`, `FROM`, `isValidEmail`,
`escapeHtml`, the header/footer HTML, and the rate-limit block. **The club invite would be
the third copy.** Extract before adding: a `sendEmail({to, subject, html, text})` wrapper,
a base HTML layout (header/footer/button), and the `share_log` rate-limit helper. Small
job, and it's the natural moment.

Also confirm `SHARE_FROM_EMAIL` is set to a verified domain in prod — it defaults to
Resend's `onboarding@resend.dev` sandbox sender, which **only delivers to the account
owner**. If that default is live, club invites would silently reach nobody.

## Build order within step 1

1. ~~**Step 0 auth fix**~~ ✅ shipped 2026-07-16. No backfill was needed.
2. ~~Migration + data access~~ ✅ shipped 2026-07-16 — `migrations/add_clubs.sql` (applied),
   `lib/clubs.ts`, `lib/clubMembers.ts`.
3. ~~`/clubs/[slug]` page~~ ✅ shipped 2026-07-16 — `app/clubs/[slug]/page.tsx` +
   `styles/clubs.module.css`. Right-rail layout mirroring `/plan`.
4. ~~`lib/email.ts` extraction + invite route~~ ✅ shipped 2026-07-16 — `lib/email.ts`,
   `POST /api/clubs/[slug]/invite`, `components/ClubInvite.tsx`, `/register` + `/login`
   email pre-fill.
5. ~~Request-to-join + approve/reject~~ ✅ shipped 2026-07-16 — `migrations/add_club_requests.sql`
   (applied), `POST /api/clubs/[slug]/request`, `POST /api/clubs/[slug]/requests`,
   `components/ClubJoinRequest.tsx`, `components/ClubRequests.tsx`.
6. ~~Role management~~ ✅ shipped 2026-07-16 — `POST /api/clubs/[slug]/members`
   (promote/demote/suspend/reactivate/remove/revoke) + `components/ClubMemberMenu.tsx`.
   Row actions resolved as a **`···` overflow menu**, portalled to `<body>` because
   `.railBody` is a scroll container that would clip an in-flow popover.

**Step 1 is complete.** Next is step 2: propose → vote (hand off to the existing `/plan`
poll engine, roster seeded from active members, `club_trip_id` on `shared_trips`).

### Role management guards (verified 2026-07-16)

Ordered so the owner rule outranks everything:

| Attempt | Result |
|---|---|
| Anyone touching the **owner** | 400 — transfer ownership first (not built) |
| **Admin** managing another **admin** | 403 — only the owner can |
| **Admin** minting a new admin | 403 — only the owner changes roles |
| Acting on **your own row** | blocked (locks you out otherwise) |
| Plain member using the route | 404 (not 403) |
| Admin managing a plain member | ✅ allowed |

Note the self-guard is currently **unreachable in practice** — a manager is always owner or
admin, and both are caught by the earlier owner/admin rules first. It's kept as a safety net
for when ownership transfer lands.

`suspend` only accepts `active` rows: suspending an unclaimed invite would need `user_id`
null, and `club_members_active_has_user` then leaves no route back to active. Revoke instead.
`remove` tombstones and **keeps `user_id`** so trip history resolves later; `revoke` deletes
(no history) and frees the address for a clean re-invite.

## BUG FIXED 2026-07-16: failed emails were reported as sent

Found while trying to confirm a real invite. **The Resend SDK does not throw on API
errors** — its return type is `{data, error: null} | {data: null, error}`, so a rejected
send *resolves*. Both share routes did:

```ts
const results = await Promise.allSettled(recipients.map((to) => resend.emails.send(...)));
const sent = results.filter((r) => r.status === "fulfilled").length;  // ← counts errors as sends
```

A promise only rejects on a transport fault, so any API-level rejection (bad domain,
invalid recipient, quota) was counted as a successful send and the UI said "Sent."
**Pre-existing in `app/api/share/route.ts` and `app/api/plan/share/email/route.ts`**; it was
inherited verbatim into `lib/email.ts` during the extraction. Verified live: a send to an
invalid address returns `error: validation_error, data: null` and resolves.

`sendEmails` now checks `r.value.error` as well as rejection, returns `{sent, failed, ids,
errors}`, logs `[email] sent: <to> <id>`, and the invite route surfaces the real error text.
Fixing the shared helper fixed all three call sites.

**Observability gap this exposed:** Resend message ids were discarded, and the API key is
send-only (cannot list or query emails), so a past send cannot be confirmed after the fact.
`ids` is now returned but **not persisted** — worth storing on `club_members` (e.g.
`last_invite_id`, `last_invited_at`) so a "was it delivered?" question is answerable, and a
resend has something to point at.

## Request-to-join (added 2026-07-16)

**Reverses the "404 for non-members" rule.** Decided: *any* club URL shows a join stub, so
a stranger with the slug learns the club exists. The leak is scoped as tightly as that
allows — the stub shows **name, home course, and member count only, never the roster**. Club
existence is public by URL; who's in it stays private. `is_public` no longer gates
requestability and is now purely an SEO/indexing flag (currently unused; every club page is
`noindex`).

**A request is the mirror image of an invite:**

| | Invite | Request |
|---|---|---|
| Direction | club → person | person → club |
| Created by | owner/admin | the requester |
| `user_id` at insert | NULL (may have no account) | always set (they're logged in) |
| Constraint | `club_members_invited_unclaimed` | `club_members_requested_bound` |
| Holds a seat? | **Yes** — the club committed one | **No** — the club agreed to nothing |
| Seat checked at | invite time | **approval time** |

That seat asymmetry is the important part: approval is what consumes a seat, so the atomic
`FOR UPDATE` seat check lives in the approve path, not the request path.

**Reject deletes the row** rather than tombstoning it. Tombstones exist to keep trip history
resolvable, and a rejected request has no history. Deleting also means a rejection is "not
now", not a ban — they can ask again. Tradeoff: nothing throttles repeated requests. If that
becomes abuse, a `rejected` status would block re-requests at the cost of leaving the
requester no way back.

**Conflict handling in the request route** (PK is `(club_id, email)`, so every re-request is
a conflict on a row that means something different): `active` → already a member; `requested`
→ pending, idempotent; `suspended` → **403, cannot self-reinstate** (else suspension means
nothing); `invited` → auto-joins, because the club already decided they're welcome;
`removed` → allowed to ask again.

### Seeded data (prod)

`GTI Founders` (`/clubs/gti-founders`), tier `small`, `seat_limit` 12, private. Casey is the
sole member (`role='owner'`, `status='active'`). **Seat limit of 12 is a placeholder** — tier
thresholds are still deferred.

### Deltas from this doc, discovered while building

- **`ON DELETE SET NULL` → `ON DELETE RESTRICT`.** As specified, the FK action and the
  `club_members_active_has_user` CHECK contradicted each other: deleting a user would try to
  null an active row and fail the CHECK with a confusing error. RESTRICT fails loudly and
  explicitly instead; account deletion must first demote the membership to `removed` (which
  clears `user_id` and satisfies the CHECK). Verified: demote → delete succeeds → tombstone
  survives.
- **Second CHECK added**, `club_members_invited_unclaimed` (`status <> 'invited' OR user_id
  IS NULL`). Makes the other half of the invite→bind lifecycle structural, so a half-bound
  row can't exist.
- **`home_course` is display text, not an Airtable slug.** `lib/airtable.ts` has no
  course-lookup-by-slug, and `getPublishedCourses()` only returns top-100 ranked courses — a
  men's club's home course usually isn't one, so a slug would resolve to nothing for most
  clubs. Add a nullable `home_course_slug` later if linking is wanted.

### Verified behavior (rolled-back transactions + live page render)

Constraints reject: active-without-user, invited-but-bound, bogus status, duplicate invite,
and deleting a user who holds a seat. The bind claims across an email case mismatch, is
idempotent on re-run, and **a suspended member cannot self-reactivate by logging in** (the
`status='invited'` clause — `claimRosterSeat` has no analog). Page renders the seat meter,
roster, and `noindex, nofollow`; a non-member gets **404 on a real club and 404 on a fake
one — indistinguishable**, which is the roster-leak defense working.
3. Migration + `lib/clubs.ts` / `lib/clubMembers.ts` data access.
4. `POST /api/clubs` + `/clubs/[slug]` page (fork of `/bag`). Now a club exists and renders.
5. Invite route + email + `/register` email pre-fill. Now the loop closes.
6. Role/suspend/remove management UI.

## Open questions

- **Creation + paywall flow (deferred, not blocking).** Decided 2026-07-16 that
  `/clubs/[slug]` is **post-paywall**: it only ever renders an already-provisioned club, so
  `tier` needs no unpaid state and the schema lands as designed. Creation is intended to be
  **self-serve** (create → pay → club exists), but that flow isn't built — provision the
  first clubs by hand (SQL insert) until billing exists. Open: what the pre-paywall create
  screen looks like, and whether it's a trial or immediate payment.
- ~~Club creation entry point~~ (superseded by the above) — self-serve (anyone creates a club, hits the seat wall)
  or manual/sales-led (you provision it)? Given clubs are the paid B2B tier and pricing
  isn't set, *manual to start* is lower-code and lets you learn from real customers.
  Not blocking the schema.
- **Seat-band thresholds + prices (later).** Actual member counts per tier
  (small vs. large) and price points — deferred; schema only needs `tier` + `seat_limit`.
- **Existing free `/plan` shares under the new paid boundary** — grandfather or trial?
  See "Free/paid boundary" above.

### Resolved
- ~~Free/paid boundary~~ → **Free is strictly solo.** Any group planning is paid;
  tier 1 = small, tier 2 = large (2026-07-16).
- ~~Backfill for existing Google users~~ → **Not needed.** Zero Google users exist
  (verified 2026-07-16); step 0 is a pure code fix. Do it before that changes.
- ~~`users.id` type / `password_hash` nullability~~ → **`uuid`, and `password_hash` is
  `NOT NULL`** and must be made nullable as a step 0 prerequisite (verified 2026-07-16).
- ~~Email-only participation~~ → **Require registration** (no anonymous path). Every seat
  is a real user; simplifies build and billing. Adoption hinges on a frictionless
  invite → pre-filled register → bind flow with Google one-click.
- ~~Club discovery/creation~~ → **Private + noindex by default, public opt-in.**

## Relevant files

- Auth: `auth.ts`, `app/api/auth/register/route.ts`, `lib/db.ts`
- Landing page template: `app/bag/page.tsx`, `components/BagCarousels.tsx`, `components/SaveButton.tsx`, `lib/userItems.tsx`
- Voting engine: `lib/planPoll.ts`, `lib/planVoteEngine.ts`, `lib/planBracket.ts`, `app/plan/shared/[id]/PollClient.tsx`, `app/api/plan/share/*`, `app/api/plan/shared/[id]/*`
- Existing migrations to mirror: `migrations/add_user_items.sql`, `migrations/add_shared_trips.sql`, `migrations/add_trip_polls.sql`
