# A welcome page, and a place where committed plans live

**Date:** 2026-08-13
**Status:** Approved, not yet implemented

## Why

`/` is currently the upload form. That makes uploading a roster the only thing the app appears to
do, and it means a committed plan is reachable only by remembering the `/pilot/<crewId>` URL and
scrolling for the window you committed to. The commitments exist in the database and have no page
of their own.

So: a welcome page that names the two things CrewRest does, and a plans page that answers "what
have I actually committed to?" without going through a roster.

The plans page also closes a real gap. There is currently **no way to un-commit a window at all** —
`POST /api/off-windows/[windowId]/commit` upserts and nothing deletes. A pilot whose roster changed
under them has no way to say so.

## Decisions taken during design

| Question | Decision | Why |
| --- | --- | --- |
| Whose plans does "My Plans" show? | All commitments in the database, grouped by pilot only when more than one exists | There is no auth, no session, and no user concept anywhere in CrewRest — the pilot page is a URL keyed to a crew ID. For a single-pilot personal tool "all of them" *is* "mine", and it invents no identity. The alternatives (a remembered crew-ID cookie, or a crew-ID prompt) are a login screen in all but name, for an app whose home page currently advertises "no account needed". |
| What can you do to a plan? | Cancel it, give it a name, and attach notes | Requested. The name earns its place once plans are a list rather than one page — "Vacation" is easier to find than a date range. Notes carry the context a name can't: who is being met, what the trip is contingent on, what to check before travelling. |
| Does cancelling delete the row? | No — mark it cancelled, keep the row | Requested. Keeps a record of a trip that was dropped, and makes restore essentially free. |
| Does `/plans` fetch live times? | No | The trains were serialized into the commitment at commit time. TCDD is unofficial and a failing request is the documented steady state (CLAUDE.md → Trains); a list page that hangs on it would be a bad trade for data that is already stored. |

## Design

### 1. Routes

| Route | What it is |
| --- | --- |
| `/` | **New.** Welcome page: the CrewRest title, one line of copy, two links. Static — no database access. |
| `/upload` | The current `/` moved verbatim. Client component, file input, posts to `/api/upload`, redirects to `/pilot/<crewId>`. |
| `/plans` | **New.** Every commitment, grouped Upcoming / Past / Cancelled. |

The two links are labelled **"Plan from schedule"** (→ `/upload`) and **"My plans"** (→ `/plans`).

`src/app/pilot/[crewId]/page.tsx` has a "Upload new schedule" link pointing at `/`; it becomes
`/upload`. That is the only existing link that moves.

### 2. Schema — three nullable columns on `CommuteCommitment`

```prisma
model CommuteCommitment {
  // ...existing fields
  /** Pilot-supplied label for the trip, e.g. "Vacation". Null means show the dates instead. */
  tripName    String?
  /** Free-text notes the pilot attached to this trip. Null means none. */
  notes       String?
  /** When the pilot cancelled this plan. Null means the plan is live. */
  cancelledAt DateTime?
}
```

`cancelledAt` rather than a status string or enum: SQLite has no enum type, and a nullable
timestamp carries both the flag and when it happened. **Active means `cancelledAt == null`.**

All three columns are nullable, so existing rows migrate to "active, unnamed, no notes" with no
backfill.

**`notes` is free text the pilot controls, and CrewRest must not invite identity data into it.**
The rule that no passenger identity is stored (CLAUDE.md → Buying tickets) is about what the app
*asks for* and *derives*; a free-text field can obviously hold anything the pilot types. The
obligation this creates is on the copy: the placeholder and label prompt for trip context ("Meeting
Ayşe at the station", "confirm with crewing first"), never for passport, TC kimlik or card details.
No validation is proposed — rejecting digits would be theatre — but the field is not advertised as
somewhere to keep documents.

Migration name: `commitment-trip-name-notes-and-cancel`.

### 3. API — the commit route gains a `PATCH`

`src/app/api/off-windows/[windowId]/commit/route.ts` keeps its `POST` and adds:

```
PATCH { tripName?: string | null, notes?: string | null, cancelled?: boolean }
```

One route rather than four because every one of these is an edit to the same row. Rename, notes,
cancel and **un-cancel** all fall out of it — restore is free once the row survives, which is the
main payoff of keeping it.

Semantics:

- `tripName` and `notes` — trimmed; empty string is stored as `null`, matching how
  `bookingReference` already treats "absent and empty both mean unset". `notes` keeps interior line
  breaks; only the ends are trimmed.
- `cancelled: true` → `cancelledAt = now()`. `cancelled: false` → `cancelledAt = null`.
- Omitting a key leaves that field alone — which is what makes it safe for the name field and the
  notes field to save independently of each other.
- `PATCH` with none of the three keys is a `400`.
- Unknown `windowId`, or a window with no commitment, is a `404`.

`POST` changes in one way: on the `update` branch it also sets `cancelledAt: null`, so re-committing
a cancelled window revives it instead of leaving a row that is both freshly committed and cancelled.

### 4. View layer

`src/lib/views/plansView.ts`, split the way `offWindowView` and `pilotScheduleView` now are:

- `assemblePlansView(input)` — pure, synchronous: grouping, sorting, label fallbacks.
- `buildPlansView(now)` — the Prisma query around it.

Added to the `SERVER_ONLY` allowlist in `src/lib/portability.test.ts`.

**`now` is an input to the pure function, never read inside it.** The upcoming/past split is a
comparison against the current time; reading the clock internally makes the function
non-deterministic and its tests time-of-day dependent.

Grouping, in precedence order:

1. `cancelledAt != null` → **Cancelled**, regardless of dates.
2. off-window `endAt < now` → **Past**.
3. otherwise → **Upcoming**.

`endAt` is the next report time — the trip is over when the pilot is due back, not when the return
train lands. Sorting: Upcoming ascending (soonest first); Past and Cancelled descending (most recent
first).

The query needs the commitment, its off-window, and the owning pilot — `commuteCommitment.findMany`
with `include: { offWindow: { include: { schedule: { include: { pilot: true } } } } }`.

### 5. What a card shows

Everything comes from the stored `SerializedTrainOption` JSON and the off-window row. No provider
call.

- **Title** — `tripName` when set, otherwise the Türkiye-local date range of **the trip itself**:
  outbound departure to return arrival. Not the off-window and not the travel window — a committed
  plan has its own span, and using it avoids re-deriving transfer math on this page.
- **Route** — outbound `originCode` → `destinationCode`, resolved to display names.
  `assemblePlansView` takes a `stationNames: Record<string, string>` input and falls back to the
  raw code for anything unmapped; `buildPlansView` builds that map from
  `trainProvider.listDestinationsFromIstanbul()` plus the `IST` base. Keeping it an input rather
  than calling the provider inside keeps the assembler pure and its tests free of provider setup.
- **Times** — outbound departure and return arrival, Türkiye local, GMT underneath, per the
  existing convention on the other pages.
- **Status** — *Ticketed* when `bookingReference` is set, otherwise *Planned*.
- **Estimate note** — when either stored train has `source: "estimate"`, say so; the stored times
  came from the curated timetable, not a live feed.
- **Pilot** — name and crew ID, rendered **only when the view contains more than one pilot**. One
  pilot is the normal case and labelling every card with it is noise.
- Links to `/pilot/<crewId>/window/<windowId>`.

- **Notes** — rendered under the trip details when present, preserving the pilot's line breaks
  (`whitespace-pre-wrap`). Long notes are clamped to a few lines with a "Show more" toggle so one
  verbose entry can't push every other card off the screen.

Cancel is a **two-step inline confirm** ("Cancel plan" → "Confirm cancel"), not `window.confirm`.
Browser modal dialogs block the page and are worse UX. A cancelled card offers "Restore" instead.

Renaming is an inline text input on the card, saved on blur or Enter, `PATCH`ing `tripName`.

Notes are a `<textarea>` on the card — multi-line, so Enter inserts a newline rather than saving.
It saves on blur, and shows a "Saving…"/"Saved" state because blur-to-save gives no other feedback.
`PATCH`es `notes` alone, so an in-flight note edit can't clobber a rename. A card with no notes
shows an "Add notes" affordance rather than a permanently open empty box.

Empty state: when there are no commitments at all, say so and link to `/upload`.

### 6. One behaviour change to existing code

`assembleOffWindowView` must treat a cancelled commitment as **not committed** — otherwise the
planner opens showing a cancelled trip as live, with its trains preselected and the button reading
"Update commitment".

The `cancelledAt` value is passed into `assembleOffWindowView`'s `commitment` input and the
assembler ignores cancelled ones, rather than `buildOffWindowView` filtering it out. Filtering in
the fetcher would put the branch back where it can only be tested against a database.

Consequence for the pilot schedule page: none. It does not read commitments.

### 7. Testing

New unit tests for `assemblePlansView`:

- grouping across the `now` boundary, including a window that ends exactly at `now`
- cancelled wins over upcoming dates
- sort order within each group
- title falls back from `tripName` to the date range
- notes survive round-tripping with their interior line breaks intact, and an all-whitespace note
  is treated as absent
- ticketed vs planned from `bookingReference`
- pilot attribution appears with two pilots and is suppressed with one
- the estimate note appears when either leg is `source: "estimate"`
- an unmapped station code falls back to showing the code rather than blank
- empty input produces three empty groups, not an error

One new `assembleOffWindowView` case: a cancelled commitment leaves `isCommitted` false and the
preselected indices at their computed defaults.

`src/lib/portability.test.ts` must stay green — `plansView.ts` goes in `SERVER_ONLY`, and neither
new page may pull `next/*` into `src/lib`.

The existing 116 tests must stay green. Test dates are built with `buildTurkeyDate` and the files
pin `process.env.TZ` to a non-Türkiye zone with the usual guard assertion, per CLAUDE.md.

### 8. Trade-offs accepted

**Cancel-then-re-commit on the same window overwrites the cancelled record.** `offWindowId` is
`@unique` and `POST` upserts, so there is one row per window and reviving it reuses that row. This
is deliberate: a new roster upload creates a whole new `ScheduleUpload` with new `OffWindow` rows,
so cancelled history survives roster changes naturally. The only case that loses information is
"cancelled, then changed my mind, same roster" — not worth dropping the unique constraint and
filtering every commitment query by status to preserve.

**The trip name and notes live only on `/plans`.** The window planner neither shows nor edits
either. If they should appear there too, that is a follow-up.

**Notes are not length-limited.** SQLite `TEXT` is effectively unbounded and this is a personal
tool with one author; a cap would be arbitrary and the "Show more" clamp already stops a long note
from wrecking the layout.

## Out of scope

- Any notion of user accounts or authentication. `/plans` shows every commitment on the server.
- Editing the booking reference from `/plans` — the planner already does that.
- Fetching live times to check whether a committed train still runs or its price moved.
- Showing plan counts or next-trip summaries on the welcome page. It stays static and
  database-free; adding a query there is a separate decision.
