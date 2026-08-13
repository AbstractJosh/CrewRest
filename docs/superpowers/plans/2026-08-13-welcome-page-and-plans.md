# Welcome Page and My Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give CrewRest a welcome page at `/` with two links, move the upload form to `/upload`, and add a `/plans` page listing every committed commute plan with a nameable title, free-text notes, and cancel/restore.

**Architecture:** Follows the view-layer pattern already established in `src/lib/views/`: each page's data assembly is a pure `assemble*View` plus a thin `build*View` doing the Prisma work, so the interesting logic is unit-tested without a database. Three nullable columns go on `CommuteCommitment`; a single `PATCH` on the existing commit route handles rename, notes and cancel/restore because all three are edits to the same row.

**Tech Stack:** Next.js 16 (App Router, server components) · React 19 · TypeScript · Prisma 7 on SQLite via `better-sqlite3` · Tailwind 4 · `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-13-welcome-page-and-plans-design.md`

## Global Constraints

- **Never use `getHours()`, `toLocaleString()`, bare `new Date(y, m, d)`, or `new Date("...")` on a zoneless string.** Build instants with `buildTurkeyDate()`; format with the `formatTurkey*` / `formatUtc*` helpers. See `src/lib/time/turkeyTime.ts`.
- **Any test asserting on Türkiye-local times must set `process.env.TZ = "America/New_York"` before its first import**, and carry the guard assertion proving the pin took effect. Copy the pattern from `src/lib/views/offWindowView.test.ts`.
- **Nothing under `src/lib` may import `next/*`.** Nothing outside the `SERVER_ONLY` allowlist in `src/lib/portability.test.ts` may import Prisma. Both are enforced by that test.
- **Pure `assemble*` functions never read the clock.** `now` is always an input.
- **`/plans` must not call the train provider for timetable data.** Trains are read from the stored commitment JSON. TCDD is unofficial and a failing request is the documented steady state.
- **Commit style:** sentence-case imperative subject, a body explaining *why*, and these two trailers verbatim:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UM4F9Un5izd77ojGNDh4s5
  ```
- **Do not commit `dev.db`, `.env`, or any roster PDF.** `/data` is gitignored on purpose.

## Testing reality in this repo

There are **no route-handler tests, no database tests and no component tests**. All 116 existing tests are pure functions run by `node:test`. This plan keeps that shape: TDD applies to `assemblePlansView` and `assembleOffWindowView`; route handlers and pages are verified by `npm run build` plus the explicit manual checks written into each task. Do not invent a database test harness.

Commands:

```bash
npm test                                                       # all tests
node --import tsx --test src/lib/views/plansView.test.ts       # one file
npm run lint
npm run build
```

## File Structure

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | **Modify.** Three nullable columns on `CommuteCommitment`. |
| `src/lib/views/plansView.ts` | **Create.** `assemblePlansView` (pure) + `buildPlansView` (Prisma). |
| `src/lib/views/plansView.test.ts` | **Create.** Unit tests for the assembler. |
| `src/lib/views/offWindowView.ts` | **Modify.** A cancelled commitment is not a commitment. |
| `src/lib/views/offWindowView.test.ts` | **Modify.** One new case for that. |
| `src/lib/portability.test.ts` | **Modify.** `views/plansView.ts` into `SERVER_ONLY`. |
| `src/app/api/off-windows/[windowId]/commit/route.ts` | **Modify.** Add `PATCH`; `POST` clears `cancelledAt`. |
| `src/app/upload/page.tsx` | **Create** (moved from `src/app/page.tsx`, unchanged). |
| `src/app/page.tsx` | **Rewrite.** Static welcome page, two links. |
| `src/app/plans/page.tsx` | **Create.** Server component, renders the view. |
| `src/app/plans/PlanCard.tsx` | **Create.** Client component: rename, notes, cancel/restore. |
| `src/app/pilot/[crewId]/page.tsx` | **Modify.** One link `/` → `/upload`. |

---

### Task 1: Add the trip name, notes and cancellation columns

**Files:**
- Modify: `prisma/schema.prisma` (the `CommuteCommitment` model)
- Create: `prisma/migrations/<timestamp>_commitment_trip_name_notes_and_cancel/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: `CommuteCommitment.tripName: string | null`, `CommuteCommitment.notes: string | null`, `CommuteCommitment.cancelledAt: Date | null` on the generated Prisma client. Every later task depends on these.

- [ ] **Step 1: Add the columns to the schema**

In `prisma/schema.prisma`, inside `model CommuteCommitment`, after the `bookingReference` field:

```prisma
  /** Pilot-supplied label for the trip, e.g. "Vacation". Null means show the dates instead. */
  tripName         String?
  /**
   * Free-text notes the pilot attached to this trip. Null means none.
   *
   * Deliberately unvalidated and unbounded. No passenger identity is asked for anywhere in
   * CrewRest, and the UI copy for this field prompts for trip context, never for documents.
   */
  notes            String?
  /** When the pilot cancelled this plan. Null means the plan is live. */
  cancelledAt      DateTime?
```

- [ ] **Step 2: Generate the migration**

Run:

```bash
npx prisma migrate dev --name commitment_trip_name_notes_and_cancel
```

Expected: a new migration directory, and the client regenerated into `src/generated/prisma`. All three columns are nullable, so existing rows need no backfill.

- [ ] **Step 3: Confirm the client picked up the new fields**

Run: `npm run build`
Expected: PASS. The build runs `tsc`; it will still pass because nothing reads the new fields yet. This step is to catch a failed `prisma generate`, not to prove behaviour.

- [ ] **Step 4: Confirm the existing suite is untouched**

Run: `npm test`
Expected: 116 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "$(cat <<'EOF'
Give a commitment a name, notes and a cancelled state

A committed window could only ever be overwritten, never dropped: the
commit route upserts and nothing deletes, so a pilot whose roster changed
under them had no way to say the trip was off.

cancelledAt is a nullable timestamp rather than a status string because
SQLite has no enum type and the timestamp carries both the flag and when
it happened. Active means cancelledAt is null.

tripName and notes exist because plans are about to become a list rather
than a single page, where a date range is a poor handle for "the trip
where I visit family". All three are nullable, so existing rows migrate
to active/unnamed/no-notes with no backfill.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UM4F9Un5izd77ojGNDh4s5
EOF
)"
```

---

### Task 2: Treat a cancelled commitment as uncommitted in the planner

**Files:**
- Modify: `src/lib/views/offWindowView.ts`
- Test: `src/lib/views/offWindowView.test.ts`

**Interfaces:**
- Consumes: `CommuteCommitment.cancelledAt` from Task 1.
- Produces: `OffWindowViewInput["commitment"]` gains a required `cancelledAt: Date | null` field. Any later code constructing that input must supply it.

Without this, cancelling a plan leaves the planner showing it as live — trains preselected, button reading "Update commitment".

- [ ] **Step 1: Write the failing test**

In `src/lib/views/offWindowView.test.ts`, inside the existing `describe("restoring a commitment", ...)` block, add:

```ts
    it("ignores a cancelled commitment, so the planner opens fresh", () => {
      // Cancelling must not leave a dropped trip looking live. The planner should behave
      // exactly as it does for a window that was never committed to.
      const view = assembleOffWindowView(
        makeInput({
          outboundCandidates: outbounds,
          commitment: {
            ...commitmentTo(outbounds[1]),
            cancelledAt: buildTurkeyDate(2026, 7, 14, 9, 0),
          },
        }),
      );

      assert.equal(view.isCommitted, false);
      assert.equal(view.bookingReference, "");
      assert.equal(
        view.initialOutboundIndex,
        0,
        "should fall back to the computed default, not the cancelled selection",
      );
    });
```

Then update the existing `commitmentTo` helper in that same block so every commitment it builds is live by default:

```ts
    function commitmentTo(option: TrainOption, tweaks: Partial<TrainOption> = {}) {
      return {
        outboundTrain: serializeTrainOption({ ...option, ...tweaks }),
        returnTrain: serializeTrainOption(option),
        bookingReference: null,
        cancelledAt: null,
      };
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/lib/views/offWindowView.test.ts`
Expected: FAIL. TypeScript will also object that `cancelledAt` is not in the commitment type — that is the same failure, surfacing earlier.

- [ ] **Step 3: Add `cancelledAt` to the input type**

In `src/lib/views/offWindowView.ts`, in `OffWindowViewInput`:

```ts
  commitment: {
    outboundTrain: SerializedTrainOption;
    returnTrain: SerializedTrainOption;
    bookingReference: string | null;
    /** Set when the pilot cancelled this plan. A cancelled commitment is ignored here. */
    cancelledAt: Date | null;
  } | null;
```

- [ ] **Step 4: Ignore cancelled commitments in the assembler**

In `assembleOffWindowView`, replace the opening destructure:

```ts
  const { pilot, offWindow, commitment } = input;
```

with:

```ts
  const { pilot, offWindow } = input;

  // A cancelled plan is not a plan. Restoring its train selection here would show a trip the
  // pilot has dropped as though it were live, with "Update commitment" on the button.
  const commitment =
    input.commitment && input.commitment.cancelledAt === null ? input.commitment : null;
```

The rest of the function already reads the local `commitment`, so nothing else changes.

- [ ] **Step 5: Pass the field through the fetcher**

In `buildOffWindowView`, in the object passed to `assembleOffWindowView`, add `cancelledAt` to the commitment branch:

```ts
    commitment: offWindow.commitment
      ? {
          // Unchecked casts, as everywhere these JSON columns are read — see CLAUDE.md.
          outboundTrain: offWindow.commitment.outboundTrain as unknown as SerializedTrainOption,
          returnTrain: offWindow.commitment.returnTrain as unknown as SerializedTrainOption,
          bookingReference: offWindow.commitment.bookingReference,
          cancelledAt: offWindow.commitment.cancelledAt,
        }
      : null,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: 117 passing, 0 failing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/views/offWindowView.ts src/lib/views/offWindowView.test.ts
git commit -m "$(cat <<'EOF'
Treat a cancelled commitment as no commitment in the planner

CommuteCommitment rows now survive cancellation, so the window planner
can no longer take the mere existence of a row as "this window is
committed". Left alone it would preselect the cancelled trip's trains and
offer "Update commitment" for a trip the pilot has dropped.

The filter is in assembleOffWindowView rather than buildOffWindowView so
the branch stays reachable from a unit test instead of needing a
database.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UM4F9Un5izd77ojGNDh4s5
EOF
)"
```

---

### Task 3: Build the plans view assembler

**Files:**
- Create: `src/lib/views/plansView.ts` (pure half only; the Prisma half lands in Task 4)
- Test: `src/lib/views/plansView.test.ts`

**Interfaces:**
- Consumes: `SerializedTrainOption` from `@/lib/trains/serialized`; `formatTurkeyRange` from `@/lib/time/turkeyTime`.
- Produces:
  - `assemblePlansView(input: PlansViewInput): PlansView`
  - `PlansView { upcoming, past, cancelled: PlanCardView[]; totalCount: number; showPilot: boolean }`
  - `PlanCardView { windowId, crewId, pilotName, title, tripName, notes, originLabel, destinationLabel, departureAt, returnArrivalAt, isTicketed, bookingReference, hasEstimates, isCancelled, href }`
  - `PlanCommitmentInput`, `PlansViewInput`

- [ ] **Step 1: Write the failing test**

Create `src/lib/views/plansView.test.ts`:

```ts
/**
 * Pinned before anything builds a date, per CLAUDE.md: the card titles are Türkiye-local ranges
 * and a bare `new Date` mis-parse is invisible on a UTC+3 host.
 */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { serializeTrainOption } from "@/lib/trains/serialized";
import type { TrainDataSource } from "@/lib/trains/TrainProvider";
import {
  assemblePlansView,
  type PlanCommitmentInput,
  type PlansViewInput,
} from "@/lib/views/plansView";

const NOW = buildTurkeyDate(2026, 7, 15, 12, 0);

const STATION_NAMES = { IST: "Istanbul", ESK: "Eskisehir" };

function leg(
  originCode: string,
  destinationCode: string,
  departureAt: Date,
  arrivalAt: Date,
  source: TrainDataSource = "live",
) {
  return serializeTrainOption({
    trainNumber: "T1",
    originCode,
    destinationCode,
    departureAt,
    arrivalAt,
    durationMinutes: Math.round((arrivalAt.getTime() - departureAt.getTime()) / 60_000),
    source,
  });
}

/** A plan departing on `day` August and reporting back two days later at 12:00. */
function plan(
  windowId: string,
  day: number,
  overrides: Partial<PlanCommitmentInput> = {},
): PlanCommitmentInput {
  return {
    windowId,
    crewId: "12345",
    pilotName: "Test Pilot",
    tripName: null,
    notes: null,
    bookingReference: null,
    cancelledAt: null,
    windowEndAt: buildTurkeyDate(2026, 7, day + 2, 12, 0),
    outboundTrain: leg(
      "IST",
      "ESK",
      buildTurkeyDate(2026, 7, day, 8, 0),
      buildTurkeyDate(2026, 7, day, 11, 0),
    ),
    returnTrain: leg(
      "ESK",
      "IST",
      buildTurkeyDate(2026, 7, day + 2, 6, 0),
      buildTurkeyDate(2026, 7, day + 2, 9, 0),
    ),
    ...overrides,
  };
}

function makeInput(overrides: Partial<PlansViewInput> = {}): PlansViewInput {
  return { now: NOW, stationNames: STATION_NAMES, commitments: [], ...overrides };
}

describe("assemblePlansView", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect",
    );
  });

  describe("grouping", () => {
    it("splits on whether the pilot is already due back", () => {
      const view = assemblePlansView(
        makeInput({ commitments: [plan("future", 20), plan("done", 1)] }),
      );

      assert.deepEqual(view.upcoming.map((p) => p.windowId), ["future"]);
      assert.deepEqual(view.past.map((p) => p.windowId), ["done"]);
      assert.deepEqual(view.cancelled, []);
    });

    it("counts a window ending exactly now as still upcoming", () => {
      // The boundary is "already due back", so equality is not yet past.
      const ending = plan("edge", 13, { windowEndAt: NOW });
      const view = assemblePlansView(makeInput({ commitments: [ending] }));

      assert.deepEqual(view.upcoming.map((p) => p.windowId), ["edge"]);
      assert.deepEqual(view.past, []);
    });

    it("puts a cancelled plan in Cancelled whatever its dates say", () => {
      const view = assemblePlansView(
        makeInput({
          commitments: [
            plan("dropped", 20, { cancelledAt: buildTurkeyDate(2026, 7, 14, 9, 0) }),
          ],
        }),
      );

      assert.deepEqual(view.cancelled.map((p) => p.windowId), ["dropped"]);
      assert.deepEqual(view.upcoming, []);
      assert.equal(view.cancelled[0].isCancelled, true);
    });

    it("returns three empty groups for no commitments at all", () => {
      const view = assemblePlansView(makeInput());

      assert.deepEqual(view.upcoming, []);
      assert.deepEqual(view.past, []);
      assert.deepEqual(view.cancelled, []);
      assert.equal(view.totalCount, 0);
    });
  });

  describe("ordering", () => {
    it("puts the soonest trip first in Upcoming and the most recent first in Past", () => {
      const view = assemblePlansView(
        makeInput({
          commitments: [
            plan("later", 25),
            plan("sooner", 18),
            plan("older", 1),
            plan("recent", 10),
          ],
        }),
      );

      assert.deepEqual(view.upcoming.map((p) => p.windowId), ["sooner", "later"]);
      assert.deepEqual(view.past.map((p) => p.windowId), ["recent", "older"]);
    });

    it("puts the most recent first in Cancelled too", () => {
      const dropped = buildTurkeyDate(2026, 7, 14, 9, 0);
      const view = assemblePlansView(
        makeInput({
          commitments: [
            plan("old", 2, { cancelledAt: dropped }),
            plan("new", 25, { cancelledAt: dropped }),
          ],
        }),
      );

      assert.deepEqual(view.cancelled.map((p) => p.windowId), ["new", "old"]);
    });
  });

  describe("the card", () => {
    it("titles a plan by its name, falling back to the trip's own dates", () => {
      const view = assemblePlansView(
        makeInput({
          commitments: [plan("named", 20, { tripName: "Vacation" }), plan("unnamed", 22)],
        }),
      );

      assert.equal(view.upcoming[0].title, "Vacation");
      // Outbound departure through return arrival — the trip, not the off-window.
      assert.equal(view.upcoming[1].title, "22 Aug 08:00 → 24 Aug 09:00");
    });

    it("is ticketed only once a booking reference exists", () => {
      const view = assemblePlansView(
        makeInput({
          commitments: [
            plan("ticketed", 20, { bookingReference: "1234567890" }),
            plan("planned", 22),
          ],
        }),
      );

      assert.equal(view.upcoming[0].isTicketed, true);
      assert.equal(view.upcoming[1].isTicketed, false);
    });

    it("resolves station codes to names and falls back to the code when unmapped", () => {
      const unmapped = plan("odd", 20, {
        outboundTrain: leg(
          "IST",
          "ZZZ",
          buildTurkeyDate(2026, 7, 20, 8, 0),
          buildTurkeyDate(2026, 7, 20, 11, 0),
        ),
      });
      const view = assemblePlansView(
        makeInput({ commitments: [plan("normal", 18), unmapped] }),
      );

      assert.equal(view.upcoming[0].originLabel, "Istanbul");
      assert.equal(view.upcoming[0].destinationLabel, "Eskisehir");
      assert.equal(view.upcoming[1].destinationLabel, "ZZZ", "unmapped code shown, not blank");
    });

    it("flags a plan whose stored times came from the curated timetable", () => {
      const estimated = plan("est", 20, {
        returnTrain: leg(
          "ESK",
          "IST",
          buildTurkeyDate(2026, 7, 22, 6, 0),
          buildTurkeyDate(2026, 7, 22, 9, 0),
          "estimate",
        ),
      });
      const view = assemblePlansView(
        makeInput({ commitments: [estimated, plan("live", 18)] }),
      );

      assert.equal(view.upcoming[1].hasEstimates, true, "one estimated leg is enough");
      assert.equal(view.upcoming[0].hasEstimates, false);
    });

    it("links to the window planner for that pilot", () => {
      const view = assemblePlansView(makeInput({ commitments: [plan("w1", 20)] }));

      assert.equal(view.upcoming[0].href, "/pilot/12345/window/w1");
    });
  });

  describe("pilot attribution", () => {
    it("is suppressed for a single pilot and shown once there are two", () => {
      const one = assemblePlansView(makeInput({ commitments: [plan("a", 20), plan("b", 22)] }));
      assert.equal(one.showPilot, false);

      const two = assemblePlansView(
        makeInput({
          commitments: [plan("a", 20), plan("b", 22, { crewId: "99999", pilotName: "Other" })],
        }),
      );
      assert.equal(two.showPilot, true);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/lib/views/plansView.test.ts`
Expected: FAIL — `Cannot find module '@/lib/views/plansView'`.

- [ ] **Step 3: Write the assembler**

Create `src/lib/views/plansView.ts`:

```ts
/**
 * Every commitment the server holds, grouped for the "My plans" page.
 *
 * Split the way the other view builders are — a pure `assemblePlansView` with a thin
 * `buildPlansView` around it — so the grouping and the label fallbacks are unit-tested without a
 * database.
 *
 * Nothing here calls the train provider. The trains were serialized into the commitment when the
 * pilot committed, and TCDD is unofficial enough that a failing request is the documented steady
 * state (CLAUDE.md → Trains); making a list page wait on it, for data already stored, would be a
 * bad trade. The consequence is that a card shows the timetable as it was at commit time.
 */

import { formatTurkeyRange } from "@/lib/time/turkeyTime";
import type { SerializedTrainOption } from "@/lib/trains/serialized";

export interface PlanCommitmentInput {
  windowId: string;
  crewId: string;
  pilotName: string;
  tripName: string | null;
  notes: string | null;
  bookingReference: string | null;
  cancelledAt: Date | null;
  /** The window's next report time — the trip is over when the pilot is due back. */
  windowEndAt: Date;
  outboundTrain: SerializedTrainOption;
  returnTrain: SerializedTrainOption;
}

export interface PlansViewInput {
  /** Injected, never read from the clock: the upcoming/past split must be deterministic. */
  now: Date;
  /** CrewRest station code → display name, e.g. `{ IST: "Istanbul" }`. */
  stationNames: Record<string, string>;
  commitments: PlanCommitmentInput[];
}

export interface PlanCardView {
  windowId: string;
  crewId: string;
  pilotName: string;
  /** `tripName` when set, otherwise the trip's own Türkiye-local date range. */
  title: string;
  tripName: string | null;
  notes: string | null;
  originLabel: string;
  destinationLabel: string;
  departureAt: Date;
  returnArrivalAt: Date;
  isTicketed: boolean;
  bookingReference: string | null;
  /** True when either stored leg came from the curated timetable rather than a live feed. */
  hasEstimates: boolean;
  isCancelled: boolean;
  href: string;
}

export interface PlansView {
  upcoming: PlanCardView[];
  past: PlanCardView[];
  cancelled: PlanCardView[];
  totalCount: number;
  /** False for the normal single-pilot case, where labelling every card would be noise. */
  showPilot: boolean;
}

function toCard(
  commitment: PlanCommitmentInput,
  stationNames: Record<string, string>,
): PlanCardView {
  const departureAt = new Date(commitment.outboundTrain.departureAt);
  const returnArrivalAt = new Date(commitment.returnTrain.arrivalAt);
  const label = (code: string) => stationNames[code] ?? code;

  return {
    windowId: commitment.windowId,
    crewId: commitment.crewId,
    pilotName: commitment.pilotName,
    title: commitment.tripName ?? formatTurkeyRange(departureAt, returnArrivalAt),
    tripName: commitment.tripName,
    notes: commitment.notes,
    originLabel: label(commitment.outboundTrain.originCode),
    destinationLabel: label(commitment.outboundTrain.destinationCode),
    departureAt,
    returnArrivalAt,
    isTicketed:
      commitment.bookingReference !== null && commitment.bookingReference.trim() !== "",
    bookingReference: commitment.bookingReference,
    hasEstimates:
      commitment.outboundTrain.source === "estimate" ||
      commitment.returnTrain.source === "estimate",
    isCancelled: commitment.cancelledAt !== null,
    href: `/pilot/${commitment.crewId}/window/${commitment.windowId}`,
  };
}

export function assemblePlansView(input: PlansViewInput): PlansView {
  const upcoming: PlanCardView[] = [];
  const past: PlanCardView[] = [];
  const cancelled: PlanCardView[] = [];

  for (const commitment of input.commitments) {
    const card = toCard(commitment, input.stationNames);
    if (commitment.cancelledAt !== null) {
      // Cancelled wins over the dates: a dropped trip is not "upcoming" however far off it is.
      cancelled.push(card);
    } else if (commitment.windowEndAt.getTime() < input.now.getTime()) {
      past.push(card);
    } else {
      upcoming.push(card);
    }
  }

  const soonestFirst = (a: PlanCardView, b: PlanCardView) =>
    a.departureAt.getTime() - b.departureAt.getTime();
  const mostRecentFirst = (a: PlanCardView, b: PlanCardView) =>
    b.departureAt.getTime() - a.departureAt.getTime();

  upcoming.sort(soonestFirst);
  past.sort(mostRecentFirst);
  cancelled.sort(mostRecentFirst);

  return {
    upcoming,
    past,
    cancelled,
    totalCount: input.commitments.length,
    showPilot: new Set(input.commitments.map((c) => c.crewId)).size > 1,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/lib/views/plansView.test.ts`
Expected: PASS, 13 tests.

If the date-range assertion fails, print the actual value before changing the expectation — `formatTurkeyRange` prints the end date only when the span crosses local midnight, and this span does.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 130 passing, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/views/plansView.ts src/lib/views/plansView.test.ts
git commit -m "$(cat <<'EOF'
Assemble the plans list from stored commitments

Groups every commitment into upcoming, past and cancelled, where
cancelled wins over the dates and the upcoming/past boundary is whether
the pilot is already due back.

`now` is an input rather than read inside, or the grouping would be
non-deterministic and its tests would depend on the time of day they run.

Nothing here calls the train provider: the legs were serialized into the
commitment at commit time, and making a list page wait on an unofficial
endpoint for data already stored would be a bad trade. A card therefore
shows the timetable as it was when the pilot committed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UM4F9Un5izd77ojGNDh4s5
EOF
)"
```

---

### Task 4: Load the plans from the database

**Files:**
- Modify: `src/lib/views/plansView.ts` (append `buildPlansView`)
- Modify: `src/lib/portability.test.ts` (`SERVER_ONLY`)

**Interfaces:**
- Consumes: `assemblePlansView` and its input types from Task 3; `CommuteCommitment.tripName/notes/cancelledAt` from Task 1.
- Produces: `buildPlansView(now?: Date): Promise<PlansView>`.

- [ ] **Step 1: Add the file to the server-only allowlist first**

In `src/lib/portability.test.ts`, add to `SERVER_ONLY`:

```ts
const SERVER_ONLY = new Set([
  "prisma.ts",
  "views/offWindowView.ts",
  "views/pilotScheduleView.ts",
  "views/plansView.ts",
]);
```

- [ ] **Step 2: Confirm the allowlist is still consistent**

Run: `node --import tsx --test src/lib/portability.test.ts`
Expected: PASS. `plansView.ts` exists on disk (Task 3 created it), so the staleness guard is satisfied; it imports no Prisma yet, so the database rule is satisfied too.

The allowlist is updated *before* the import lands so that Step 4 sees a real result rather than a failure it was always going to hit.

- [ ] **Step 3: Append the loader**

At the end of `src/lib/views/plansView.ts`, add these imports at the top of the file:

```ts
import { prisma } from "@/lib/prisma";
import { trainProvider } from "@/lib/trains";
```

and this function at the bottom:

```ts
/**
 * Loads every commitment on the server and assembles the view.
 *
 * There is no user identity anywhere in CrewRest — the pilot page is a URL keyed to a crew ID —
 * so "my plans" is every plan. `showPilot` covers the case where more than one roster has been
 * uploaded.
 */
export async function buildPlansView(now: Date = new Date()): Promise<PlansView> {
  const rows = await prisma.commuteCommitment.findMany({
    include: { offWindow: { include: { schedule: { include: { pilot: true } } } } },
  });

  // `listDestinationsFromIstanbul` returns destinations *from* IST, so it never contains IST
  // itself — the origin end of every outbound leg has to be seeded separately.
  const stationNames: Record<string, string> = { IST: "Istanbul" };
  for (const station of trainProvider.listDestinationsFromIstanbul()) {
    stationNames[station.code] = station.city;
  }

  return assemblePlansView({
    now,
    stationNames,
    commitments: rows.map((row) => ({
      windowId: row.offWindowId,
      crewId: row.offWindow.schedule.pilot.crewId,
      pilotName: row.offWindow.schedule.pilot.name,
      tripName: row.tripName,
      notes: row.notes,
      bookingReference: row.bookingReference,
      cancelledAt: row.cancelledAt,
      windowEndAt: row.offWindow.endAt,
      // Unchecked casts, as everywhere these JSON columns are read — see CLAUDE.md.
      outboundTrain: row.outboundTrain as unknown as SerializedTrainOption,
      returnTrain: row.returnTrain as unknown as SerializedTrainOption,
    })),
  });
}
```

- [ ] **Step 4: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: 130 passing; build succeeds. The portability test must pass — `plansView.ts` is now both a Prisma importer and an allowlist entry.

- [ ] **Step 5: Commit**

```bash
git add src/lib/views/plansView.ts src/lib/portability.test.ts
git commit -m "$(cat <<'EOF'
Load every commitment for the plans view

"My plans" is every plan on the server: CrewRest has no auth, no session
and no user concept, so there is nothing to scope by. showPilot covers
the case where more than one roster has been uploaded, and is false in
the normal single-pilot case where labelling each card would be noise.

The station map seeds IST by hand because listDestinationsFromIstanbul
returns destinations *from* Istanbul and so never includes it, while
every outbound leg starts there.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UM4F9Un5izd77ojGNDh4s5
EOF
)"
```

---

### Task 5: Add PATCH for rename, notes and cancel/restore

**Files:**
- Modify: `src/app/api/off-windows/[windowId]/commit/route.ts`

**Interfaces:**
- Consumes: the columns from Task 1.
- Produces: `PATCH /api/off-windows/[windowId]/commit` accepting `{ tripName?, notes?, cancelled? }` and returning `{ ok: true, tripName, notes, cancelledAt }`. Task 7's client component calls exactly this.

There are no route tests in this repo; verification is the build plus the manual checks in Step 4.

**Coverage note:** the spec lists "notes survive round-tripping with their line breaks, and an all-whitespace note is treated as absent" under testing. That behaviour lives in `normalizeText` here, in a route module with no test harness — not in `assemblePlansView`. It is therefore covered by the Step 4 curl checks, not by a unit test. Do not move `normalizeText` into `src/lib` just to make it testable; it is four lines and its only caller is this route.

- [ ] **Step 1: Make `POST` revive a cancelled commitment**

In the existing `POST`, in the `update` branch of the upsert, add `cancelledAt: null`:

```ts
    update: {
      outboundTrain: body.outbound,
      returnTrain: body.return,
      bookingReference,
      // Re-committing a window the pilot had cancelled makes the plan live again; leaving the
      // timestamp would produce a row that is both freshly committed and cancelled.
      cancelledAt: null,
    },
```

Leave the `create` branch alone — a new row is live by default.

- [ ] **Step 2: Add the `PATCH` handler**

Append to the same file:

```ts
/** Absent, empty and whitespace-only all mean "unset" — as `bookingReference` already treats it. */
function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Edits to an existing commitment: rename, notes, cancel and restore.
 *
 * One handler rather than three routes because all of these are edits to the same row, and
 * because omitting a key leaves that field alone — which is what lets the name field and the
 * notes field save independently without either clobbering the other's in-flight edit.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/off-windows/[windowId]/commit">,
) {
  const { windowId } = await ctx.params;
  const body = await request.json();

  const hasTripName = "tripName" in body;
  const hasNotes = "notes" in body;
  const hasCancelled = "cancelled" in body;

  if (!hasTripName && !hasNotes && !hasCancelled) {
    return NextResponse.json(
      { error: "Send at least one of tripName, notes or cancelled." },
      { status: 400 },
    );
  }
  if (hasCancelled && typeof body.cancelled !== "boolean") {
    return NextResponse.json({ error: "cancelled must be true or false." }, { status: 400 });
  }

  const existing = await prisma.commuteCommitment.findUnique({
    where: { offWindowId: windowId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "No commitment for this off-window." },
      { status: 404 },
    );
  }

  const data: {
    tripName?: string | null;
    notes?: string | null;
    cancelledAt?: Date | null;
  } = {};
  if (hasTripName) data.tripName = normalizeText(body.tripName);
  if (hasNotes) data.notes = normalizeText(body.notes);
  if (hasCancelled) data.cancelledAt = body.cancelled ? new Date() : null;

  const updated = await prisma.commuteCommitment.update({
    where: { offWindowId: windowId },
    data,
  });

  return NextResponse.json({
    ok: true,
    tripName: updated.tripName,
    notes: updated.notes,
    cancelledAt: updated.cancelledAt,
  });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 4: Verify by hand against a real commitment**

Start `npm run dev`. You need a real committed window — upload a roster, open a window, commit to a trip. Take its `windowId` from the URL, then:

```bash
# Name it
curl -X PATCH localhost:3000/api/off-windows/<windowId>/commit \
  -H 'Content-Type: application/json' -d '{"tripName":"  Vacation  "}'
# Expect: {"ok":true,"tripName":"Vacation",...}  — trimmed

# Add notes with a line break, then cancel
curl -X PATCH localhost:3000/api/off-windows/<windowId>/commit \
  -H 'Content-Type: application/json' -d '{"notes":"Meeting at the station.\nBring the charger."}'
curl -X PATCH localhost:3000/api/off-windows/<windowId>/commit \
  -H 'Content-Type: application/json' -d '{"cancelled":true}'
# Expect cancelledAt to be a timestamp, tripName and notes unchanged

# Reload the window planner in the browser
# Expect: it opens FRESH — no preselected trains, button reads "Commit to this commute"

# Restore
curl -X PATCH localhost:3000/api/off-windows/<windowId>/commit \
  -H 'Content-Type: application/json' -d '{"cancelled":false}'

# Rejections
curl -X PATCH localhost:3000/api/off-windows/<windowId>/commit \
  -H 'Content-Type: application/json' -d '{}'
# Expect: 400
curl -X PATCH localhost:3000/api/off-windows/unknown-id/commit \
  -H 'Content-Type: application/json' -d '{"cancelled":true}'
# Expect: 404
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/off-windows/[windowId]/commit/route.ts"
git commit -m "$(cat <<'EOF'
Let a commitment be renamed, annotated and cancelled

One PATCH rather than three routes: rename, notes and cancel are all
edits to the same row, and omitting a key leaves that field alone, which
is what lets the name input and the notes textarea save independently
without either clobbering the other's in-flight edit.

Restore falls out of the same handler for free now that cancelling keeps
the row — cancelled:false just clears the timestamp.

POST now clears cancelledAt on its update branch, so re-committing a
window the pilot had dropped makes it live again instead of leaving a row
that is both freshly committed and cancelled.

Text fields treat absent, empty and whitespace-only alike as unset,
matching how bookingReference already behaves.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UM4F9Un5izd77ojGNDh4s5
EOF
)"
```

---

### Task 6: Move upload to /upload and put a welcome page at /

**Files:**
- Create: `src/app/upload/page.tsx` (moved from `src/app/page.tsx`)
- Rewrite: `src/app/page.tsx`
- Modify: `src/app/pilot/[crewId]/page.tsx` (one link)

**Interfaces:**
- Consumes: nothing.
- Produces: routes `/` and `/upload`. Task 7's empty state links to `/upload`.

- [ ] **Step 1: Move the upload page, preserving history**

```bash
mkdir -p src/app/upload
git mv src/app/page.tsx src/app/upload/page.tsx
```

Do not edit the file's contents. It is a `"use client"` component and stays exactly as it is, including its `router.push(\`/pilot/${data.crewId}\`)` redirect.

- [ ] **Step 2: Write the welcome page**

Create `src/app/page.tsx`:

```tsx
import Link from "next/link";

/**
 * The landing page. Deliberately static and database-free: it names the two things CrewRest does
 * and gets out of the way. Adding a plan count here would make the first paint wait on a query.
 */
export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          CrewRest
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Find the gaps between your duties that are long enough to be worth a train trip
          home, and keep track of the ones you commit to.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/upload"
            className="group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              Plan from schedule →
            </span>
            <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
              Upload your monthly roster PDF and see which off-periods are long enough to
              travel home.
            </span>
          </Link>

          <Link
            href="/plans"
            className="group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              My plans →
            </span>
            <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
              The trips you&apos;ve committed to, with their trains, tickets and notes.
            </span>
          </Link>
        </div>

        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
          No account needed — after upload you&apos;ll get a link keyed to your crew ID that
          you can come back to.
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Repoint the one link that moved**

In `src/app/pilot/[crewId]/page.tsx`, change:

```tsx
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Upload new schedule
        </Link>
```

to `href="/upload"`. Everything else on that page is unchanged.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint`
Expected: both pass, and the route list now shows `/`, `/upload` and the existing routes.

Then `npm run dev` and check by hand:
- `/` renders the two links; neither 404s.
- `/upload` still uploads a roster and redirects to `/pilot/<crewId>`.
- From `/pilot/<crewId>`, "Upload new schedule" lands on `/upload`, not `/`.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/upload/page.tsx "src/app/pilot/[crewId]/page.tsx"
git commit -m "$(cat <<'EOF'
Give the app a front door instead of an upload form

/ was the upload form, which made uploading a roster look like the only
thing CrewRest does and left committed plans reachable only by
remembering a /pilot/<crewId> URL. The form moves to /upload unchanged
and / becomes a welcome page naming the two things the app does.

The welcome page stays static and database-free on purpose: showing a
plan count there would make the first paint wait on a query.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UM4F9Un5izd77ojGNDh4s5
EOF
)"
```

---

### Task 7: Build the /plans page

**Files:**
- Create: `src/app/plans/page.tsx`
- Create: `src/app/plans/PlanCard.tsx`

**Interfaces:**
- Consumes: `buildPlansView` and `PlanCardView` from Task 4; `PATCH /api/off-windows/[windowId]/commit` from Task 5; `/upload` from Task 6.
- Produces: route `/plans`.

- [ ] **Step 1: Write the card component**

Create `src/app/plans/PlanCard.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatTurkeyDateTime, formatUtcRange } from "@/lib/time/turkeyTime";
import type { PlanCardView } from "@/lib/views/plansView";

type SaveState = "idle" | "saving" | "saved" | "error";

function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const text =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Could not save";
  const tone =
    state === "error"
      ? "text-red-600 dark:text-red-400"
      : "text-zinc-400 dark:text-zinc-500";
  return <span className={`text-xs ${tone}`}>{text}</span>;
}

export default function PlanCard({
  plan,
  showPilot,
}: {
  plan: PlanCardView;
  showPilot: boolean;
}) {
  const router = useRouter();
  const [tripName, setTripName] = useState(plan.tripName ?? "");
  const [notes, setNotes] = useState(plan.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(Boolean(plan.notes));
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [nameState, setNameState] = useState<SaveState>("idle");
  const [notesState, setNotesState] = useState<SaveState>("idle");
  // Cancel and restore get their own state: reusing the name field's would flash "Saving…" next
  // to the title for an action that has nothing to do with it.
  const [actionState, setActionState] = useState<SaveState>("idle");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  /**
   * Each field PATCHes only its own key, so an in-flight notes save can't overwrite a rename the
   * pilot made a moment earlier — the handler leaves omitted keys alone.
   */
  async function patch(body: Record<string, unknown>, setState: (s: SaveState) => void) {
    setState("saving");
    try {
      const response = await fetch(`/api/off-windows/${plan.windowId}/commit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setState("error");
        return;
      }
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  const departure = formatTurkeyDateTime(plan.departureAt);
  const returnArrival = formatTurkeyDateTime(plan.returnArrivalAt);

  return (
    <li
      className={`rounded-lg border p-4 ${
        plan.isCancelled
          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <input
            value={tripName}
            onChange={(e) => {
              setTripName(e.target.value);
              setNameState("idle");
            }}
            onBlur={() => {
              if (tripName.trim() === (plan.tripName ?? "")) return;
              patch({ tripName }, setNameState);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder={plan.title}
            aria-label="Trip name"
            className="w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 font-medium text-zinc-900 hover:border-zinc-300 focus:border-zinc-400 focus:outline-none dark:text-zinc-100 dark:hover:border-zinc-700"
          />
          <p className="mt-1 px-1 text-sm text-zinc-500 dark:text-zinc-400">
            {plan.originLabel} ⇄ {plan.destinationLabel}
            {showPilot && ` · ${plan.pilotName} (${plan.crewId})`}
          </p>
          <p className="mt-0.5 px-1 text-sm text-zinc-600 dark:text-zinc-300">
            out {departure} · back {returnArrival}
          </p>
          <p className="mt-0.5 px-1 text-xs text-zinc-400 dark:text-zinc-500">
            {formatUtcRange(plan.departureAt, plan.returnArrivalAt)} GMT
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {plan.isCancelled ? (
            <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Cancelled
            </span>
          ) : plan.isTicketed ? (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              Ticketed
            </span>
          ) : (
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              Planned
            </span>
          )}
          <SaveHint state={nameState} />
        </div>
      </div>

      {plan.notes || notesOpen ? (
        <div className="mt-3">
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesState("idle");
            }}
            onBlur={() => {
              if (notes.trim() === (plan.notes ?? "")) return;
              patch({ notes }, setNotesState);
            }}
            rows={notesExpanded ? 8 : 3}
            placeholder="Anything worth remembering about this trip — who you're meeting, what to confirm before you travel."
            aria-label="Trip notes"
            className="w-full whitespace-pre-wrap rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
          <div className="mt-1 flex items-center gap-3">
            {notes.split("\n").length > 3 && (
              <button
                type="button"
                onClick={() => setNotesExpanded((v) => !v)}
                className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                {notesExpanded ? "Show less" : "Show more"}
              </button>
            )}
            <SaveHint state={notesState} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className="mt-3 text-sm font-medium text-zinc-500 underline underline-offset-4 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Add notes
        </button>
      )}

      {plan.hasEstimates && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          Saved from the curated timetable, not a live feed — confirm on ebilet before travelling.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link
          href={plan.href}
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Open planner
        </Link>

        {plan.isCancelled ? (
          <button
            type="button"
            onClick={() => patch({ cancelled: false }, setActionState)}
            className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Restore
          </button>
        ) : confirmingCancel ? (
          <>
            <button
              type="button"
              onClick={() => {
                setConfirmingCancel(false);
                patch({ cancelled: true }, setActionState);
              }}
              className="text-sm font-medium text-red-600 underline underline-offset-4 dark:text-red-400"
            >
              Confirm cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="text-sm text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
            >
              Keep it
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="text-sm font-medium text-zinc-500 underline underline-offset-4 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
          >
            Cancel plan
          </button>
        )}

        {plan.bookingReference && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            PNR {plan.bookingReference}
          </span>
        )}

        <SaveHint state={actionState} />
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/plans/page.tsx`:

```tsx
import Link from "next/link";
import { buildPlansView, type PlanCardView } from "@/lib/views/plansView";
import PlanCard from "./PlanCard";

/**
 * This page reads the database and has no dynamic params, so without this Next would try to
 * prerender it at build time — which means querying SQLite during `next build`.
 */
export const dynamic = "force-dynamic";

function Section({
  title,
  plans,
  showPilot,
}: {
  title: string;
  plans: PlanCardView[];
  showPilot: boolean;
}) {
  if (plans.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
        {title}{" "}
        <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
          ({plans.length})
        </span>
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {plans.map((plan) => (
          <PlanCard key={plan.windowId} plan={plan} showPilot={showPilot} />
        ))}
      </ul>
    </section>
  );
}

export default async function PlansPage() {
  const view = await buildPlansView(new Date());

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          My plans
        </h1>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Home
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Trains as they were when you committed — Türkiye local time, GMT underneath.
      </p>

      {view.totalCount === 0 ? (
        <p className="mt-10 rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          No plans yet.{" "}
          <Link
            href="/upload"
            className="font-medium underline underline-offset-4 hover:text-zinc-950 dark:hover:text-zinc-50"
          >
            Upload a schedule
          </Link>{" "}
          and commit to a trip to see it here.
        </p>
      ) : (
        <>
          <Section title="Upcoming" plans={view.upcoming} showPilot={view.showPilot} />
          <Section title="Past" plans={view.past} showPilot={view.showPilot} />
          <Section title="Cancelled" plans={view.cancelled} showPilot={view.showPilot} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build && npm run lint`
Expected: both pass. `/plans` must appear as `ƒ (Dynamic)` in the route list — if it shows `○ (Static)`, the `dynamic` export is missing.

- [ ] **Step 4: Verify by hand**

`npm run dev`, then with at least one committed window:

- `/plans` lists it under **Upcoming**, titled with its date range, showing the route, out/back times, GMT underneath, and a **Planned** or **Ticketed** badge.
- Type a name into the title and click away → "Saved", and it survives a reload.
- Click **Add notes**, type two lines, click away → saved, line breaks preserved on reload.
- **Cancel plan** → **Confirm cancel** moves the card to **Cancelled**. Opening its planner shows no preselected trains.
- **Restore** puts it back under Upcoming.
- Delete every commitment (or use a fresh database) → the empty state renders and links to `/upload`.

- [ ] **Step 5: Run the full suite one last time**

Run: `npm test && npm run lint && npm run build`
Expected: 130 passing; lint clean; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/plans
git commit -m "$(cat <<'EOF'
Add the My plans page

Lists every commitment grouped into upcoming, past and cancelled, each
card rendered from the trains stored at commit time rather than a fresh
timetable query.

Cancelling is a two-step inline confirm rather than window.confirm: a
modal blocks the page and is worse to use. Renaming saves on blur or
Enter; notes are a textarea so Enter inserts a newline instead, which is
why they save on blur alone and show an explicit saving/saved hint —
there is otherwise no feedback that anything happened. Each field PATCHes
only its own key so the two can't clobber each other.

The page is force-dynamic because it queries the database and has no
dynamic params; without it Next would prerender it at build time and hit
SQLite during next build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UM4F9Un5izd77ojGNDh4s5
EOF
)"
```

---

## Post-implementation

Update `CLAUDE.md`:

- The route list in **Architecture** gains `/`, `/upload` and `/plans`, and the note that pages hold no logic beyond awaiting a builder now covers `plansView`.
- **The view layer** section lists `plansView.ts` alongside the other two.
- **Data model** gains: `CommuteCommitment.cancelledAt` is the cancellation flag, and `assembleOffWindowView` ignores cancelled commitments — a fact that is easy to break and hard to notice.

Commit that with the same trailers.
