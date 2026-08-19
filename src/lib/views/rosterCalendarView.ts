/**
 * The roster as a month calendar: duties, the transfers to and from the station, and the train
 * rides themselves, laid out as bars across the days they cover.
 *
 * The list view next door shows the roster as uploaded. This one shows the roster *with trips on
 * it*, which is why it reads commitments and the timetable, and the list reads neither. Two kinds
 * of trip are drawn, and the difference is only in the tooltip:
 *
 *   committed — the trains the pilot actually chose, read back from the stored commitment.
 *   suggested — what the planner would open with for a window they have not planned yet.
 *
 * A suggestion is not a plan, and the calendar says so. It exists because a month of duty bars
 * with empty gaps answers "when am I free" but not "and could I get home in that", which is the
 * question CrewRest is for.
 *
 * Split like every other builder — a pure `assemble` with a thin `build` around it. The geometry
 * lives one level further down in `src/lib/calendar/monthGrid.ts`; this file decides *what* the
 * events are, not where they are drawn.
 */

import { prisma } from "@/lib/prisma";
import {
  buildMonthGrid,
  type CalendarEvent,
  type CalendarEventType,
  type MonthGrid,
} from "@/lib/calendar/monthGrid";
import { computeTravelWindow } from "@/lib/schedule/travelWindow";
import { turkeyDateKey } from "@/lib/time/turkeyTime";
import { searchTrainsInWindow, trainProvider, type TrainOption } from "@/lib/trains";
import { evaluateCommuteFeasibility } from "@/lib/trains/commuteFeasibility";
import { toDatedTrainOption, type SerializedTrainOption } from "@/lib/trains/serialized";
import { assembleOffWindowView, MAX_DAYS_TO_SEARCH } from "@/lib/views/offWindowView";

/** Only the pilot fields this view reads — so a test needn't build a whole Prisma row. */
export interface RosterCalendarViewPilot {
  crewId: string;
  name: string;
  aircraftType: string | null;
  /** Both the transit bars' length and half the merge threshold — see `mergeAdjacent`. */
  airportTransferMinutes: number;
  /** Doubles as the threshold for merging adjacent duties — see `mergeAdjacent`. */
  minOffHours: number;
}

export interface RosterCalendarDutyInput {
  id: string;
  startAt: Date;
  endAt: Date;
  type: string;
}

export interface RosterCalendarTripInput {
  id: string;
  outboundTrain: SerializedTrainOption;
  returnTrain: SerializedTrainOption;
  /**
   * The off-window the trip sits in — duty release (MS) to the next report time (MB), exactly as
   * `OffWindow` stores it and *not* the buffered travel window. The transit bars are drawn against
   * these two instants; see `transferEvents`.
   */
  windowStartAt: Date;
  windowEndAt: Date;
  /** Null means the plan is live; a cancelled plan is not drawn. Always null for a suggestion. */
  cancelledAt: Date | null;
  /** False for a trip the planner would offer but the pilot has not committed to. */
  isCommitted: boolean;
}

export interface RosterCalendarViewInput {
  pilot: RosterCalendarViewPilot;
  schedule: {
    period: string;
    duties: RosterCalendarDutyInput[];
    trips: RosterCalendarTripInput[];
  } | null;
}

export interface RosterCalendarView {
  crewId: string;
  name: string;
  aircraftType: string | null;
  /** Null when the pilot exists but has uploaded nothing yet. */
  period: string | null;
  hasSchedule: boolean;
  /**
   * One grid per Türkiye month the roster touches — almost always exactly one, since a roster is
   * a month. A roster spanning a boundary gets both rather than silently losing the overflow,
   * which is the only reason this is a list and not a single grid.
   */
  months: MonthGrid[];
  /**
   * True when any trip drawn holds a train the live endpoint didn't answer for. The bars print
   * their times to the minute either way, so the page has to be able to say which kind they are —
   * the same derivation `plansView` makes for a stored commitment, under the same copy.
   */
  hasEstimates: boolean;
}

/**
 * A day off is drawn as an empty cell, by design: the calendar's job is to show where the pilot
 * is committed, and printing "Day off" across the gaps would bury the thing they are looking for.
 *
 * Standby carries its own type, and so its own colour: it is not flying, and a month of identical
 * blue bars flattens a distinction the roster actually makes.
 */
const DUTY_KINDS: Record<
  string,
  { type: CalendarEventType; label: string; shortLabel: string }
> = {
  FLIGHT: { type: "duty", label: "Flight duty", shortLabel: "Duty" },
  HSBY: { type: "standby", label: "Home standby", shortLabel: "Standby" },
};

const MINUTE_MS = 60_000;

/** What a suggested bar's tooltip says, so it is never mistaken for a booked trip. */
const SUGGESTION_DETAIL = "suggested, not committed";

/**
 * Folds duties of the same kind into one bar when the gap between them is not a commute
 * opportunity.
 *
 * A roster prints a duty per day, so left alone a month is a row of near-identical bars with
 * hairline gaps between them — and the gaps are the thing on this calendar the pilot is reading
 * for. Which gaps count is not this file's decision to make twice: the test is the one
 * `assemblePilotScheduleView` applies, `minOffHours` measured against the *buffered* travel
 * window rather than the raw MS→MB gap. A 25-hour gap with a 90-minute transfer at each end is 22
 * hours of travel time and the schedule page hides it; a calendar merging on the raw gap would
 * leave it standing, and the pilot would be looking at a break the rest of the app denies exists.
 *
 * A gap holding a live trip is never folded, whatever its length. The pilot can commit to a window
 * and then raise their threshold — the commit route has no `minOffHours` gate — and folding then
 * would draw a solid duty bar straight over the trip they are about to take, with the trip's own
 * bars nested inside it and nowhere for `buildMonthGrid` to put them.
 *
 * A merged bar says so in its tooltip. The underlying duties are still separate duties, and a
 * pilot counting sectors should not be misled by a display decision.
 */
function mergeAdjacent(
  events: CalendarEvent[],
  pilot: { minOffHours: number; airportTransferMinutes: number },
  tripWindows: { startAt: Date; endAt: Date }[],
): CalendarEvent[] {
  const minOffMinutes = pilot.minOffHours * 60;

  const isCommuteOpportunity = (startAt: Date, endAt: Date) => {
    const travel = computeTravelWindow({ startAt, endAt }, pilot.airportTransferMinutes);
    return travel.isViable && travel.minutes >= minOffMinutes;
  };

  const holdsATrip = (startAt: Date, endAt: Date) =>
    tripWindows.some(
      (w) => w.startAt.getTime() < endAt.getTime() && w.endAt.getTime() > startAt.getTime(),
    );

  const sorted = [...events].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const merged: { event: CalendarEvent; count: number }[] = [];

  for (const event of sorted) {
    const previous = merged[merged.length - 1];

    // Same kind of duty, with nothing usable between them.
    if (
      previous &&
      previous.event.type === event.type &&
      !isCommuteOpportunity(previous.event.endAt, event.startAt) &&
      !holdsATrip(previous.event.endAt, event.startAt)
    ) {
      previous.event = {
        ...previous.event,
        endAt: event.endAt > previous.event.endAt ? event.endAt : previous.event.endAt,
      };
      previous.count += 1;
      continue;
    }

    merged.push({ event: { ...event }, count: 1 });
  }

  return merged.map(({ event, count }) =>
    count === 1
      ? event
      : { ...event, id: `${event.id}+${count}`, detail: `${count} duties combined` },
  );
}

function trainEvent(
  id: string,
  train: SerializedTrainOption,
  tentative: boolean,
): CalendarEvent {
  return {
    id,
    type: "train",
    label: "Train ride",
    shortLabel: "Train",
    detail: tentative ? SUGGESTION_DETAIL : undefined,
    isTentative: tentative,
    startAt: new Date(train.departureAt),
    endAt: new Date(train.arrivalAt),
  };
}

/**
 * The airport↔station transfer at each end of a trip, drawn as its own bar.
 *
 * Derived rather than stored, from the same `airportTransferMinutes` that `computeTravelWindow`
 * subtracts from both ends of a window: the outbound leg is the run to the station before the
 * train, the return leg the run from the station afterwards. Deriving it here keeps the promise
 * the rest of CrewRest makes — that changing the transfer setting never requires re-uploading or
 * re-committing anything.
 *
 * Each bar is anchored to the duty it touches, not to the train. The outbound transfer starts the
 * instant the duty is released (MS) and the return one ends at the next report time (MB), so the
 * calendar shows duty turning into transit with nothing between them: the pilot is not standing
 * still at the airport, and a gap there read as free time that does not exist. The train end of
 * each bar is where the transfer's *duration* lands, and it gives way to the timetable — a train
 * leaving sooner than the transfer takes shortens the bar rather than being overrun by it.
 *
 * The window's own bounds are the right anchor precisely because they are unbuffered. The buffer
 * is applied exactly once, in `computeTravelWindow` (see CLAUDE.md); clamping to the already
 * buffered window would draw the transfer inside the time the transfer was subtracted for.
 */
function transferEvents(
  tripId: string,
  windowStartAt: Date,
  windowEndAt: Date,
  outbound: SerializedTrainOption,
  returnTrain: SerializedTrainOption,
  transferMinutes: number,
  tentative: boolean,
): CalendarEvent[] {
  if (transferMinutes <= 0) return [];

  const detail = tentative ? SUGGESTION_DETAIL : undefined;

  const transferMs = transferMinutes * MINUTE_MS;
  const events: CalendarEvent[] = [];

  const outboundEnd = Math.min(
    windowStartAt.getTime() + transferMs,
    new Date(outbound.departureAt).getTime(),
  );
  const returnStart = Math.max(
    windowEndAt.getTime() - transferMs,
    new Date(returnTrain.arrivalAt).getTime(),
  );

  // A bar with nothing in it is not a short journey, it is no journey — a train leaving at the
  // moment of release, or landing after the next report time. Better absent than a sliver of
  // colour that the minimum width would then inflate into a visible leg.
  if (outboundEnd > windowStartAt.getTime()) {
    events.push({
      id: `${tripId}:transfer-out`,
      type: "transit",
      label: "Transit to stn",
      shortLabel: "Transit",
      detail,
      isTentative: tentative,
      startAt: windowStartAt,
      endAt: new Date(outboundEnd),
    });
  }

  if (returnStart < windowEndAt.getTime()) {
    events.push({
      id: `${tripId}:transfer-back`,
      type: "transit",
      label: "Transit to apt",
      shortLabel: "Transit",
      detail,
      isTentative: tentative,
      startAt: new Date(returnStart),
      endAt: windowEndAt,
    });
  }

  return events;
}

/** Every Türkiye month an event touches, oldest first, as `{ year, month }` with month 0-based. */
function monthsTouched(events: CalendarEvent[]): { year: number; month: number }[] {
  const keys = new Set<string>();
  for (const event of events) {
    keys.add(turkeyDateKey(event.startAt).slice(0, 7));
    keys.add(turkeyDateKey(event.endAt).slice(0, 7));
  }
  return [...keys].sort().map((key) => {
    const [year, month] = key.split("-").map(Number);
    return { year, month: month - 1 };
  });
}

export function assembleRosterCalendarView(
  input: RosterCalendarViewInput,
): RosterCalendarView {
  const { pilot, schedule } = input;

  const dutyEvents: CalendarEvent[] = (schedule?.duties ?? []).flatMap((duty) => {
    const kind = DUTY_KINDS[duty.type];
    if (!kind) return [];
    return [{ id: duty.id, ...kind, startAt: duty.startAt, endAt: duty.endAt }];
  });

  // A cancelled plan keeps its row (see CLAUDE.md) but is not a trip, so it is not drawn.
  const trips = (schedule?.trips ?? []).filter((trip) => trip.cancelledAt === null);

  const tripEvents: CalendarEvent[] = trips.flatMap((trip) => {
    const tentative = !trip.isCommitted;
    return [
      trainEvent(`${trip.id}:outbound`, trip.outboundTrain, tentative),
      trainEvent(`${trip.id}:return`, trip.returnTrain, tentative),
      ...transferEvents(
        trip.id,
        trip.windowStartAt,
        trip.windowEndAt,
        trip.outboundTrain,
        trip.returnTrain,
        pilot.airportTransferMinutes,
        tentative,
      ),
    ];
  });

  const events = [
    ...mergeAdjacent(
      dutyEvents,
      pilot,
      trips.map((trip) => ({ startAt: trip.windowStartAt, endAt: trip.windowEndAt })),
    ),
    ...tripEvents,
  ];

  return {
    crewId: pilot.crewId,
    name: pilot.name,
    aircraftType: pilot.aircraftType,
    period: schedule?.period ?? null,
    hasSchedule: schedule !== null,
    months: monthsTouched(events).map(({ year, month }) => buildMonthGrid(year, month, events)),
    hasEstimates: trips.some(
      (trip) =>
        trip.outboundTrain.source === "estimate" || trip.returnTrain.source === "estimate",
    ),
  };
}

interface SuggestableWindow {
  id: string;
  startAt: Date;
  endAt: Date;
  travelEligible: boolean;
  commitment: { cancelledAt: Date | null } | null;
}

/**
 * Which windows are worth asking the timetable about.
 *
 * Pure, and separate from the search it gates, because each window it returns costs real HTTP
 * requests against an unofficial endpoint — so what gets in is worth being able to test:
 *
 *   - a window with a live commitment is excluded; its trains are already known and stored.
 *   - a window the transfers swallow, or one under the pilot's threshold, is not a trip.
 *   - a window that has already closed is excluded: nothing can be booked in it, and searching
 *     for it would spend a request on a suggestion nobody can act on.
 */
export function windowsWorthSuggesting<T extends SuggestableWindow>(
  windows: T[],
  pilot: { minOffHours: number; airportTransferMinutes: number },
  now: Date,
): T[] {
  const minMinutes = pilot.minOffHours * 60;

  return windows.filter((window) => {
    if (window.commitment && window.commitment.cancelledAt === null) return false;
    if (!window.travelEligible) return false;
    if (window.endAt.getTime() <= now.getTime()) return false;

    const travel = computeTravelWindow(window, pilot.airportTransferMinutes);
    return travel.isViable && travel.minutes >= minMinutes;
  });
}

/**
 * The pair the planner page would open with for this window, or null if there isn't a workable
 * one.
 *
 * Deliberately routed through `assembleOffWindowView` rather than re-deriving the choice here:
 * that function already encodes which trains are boardable, which returns land in time, which are
 * sold out, and which one to default to. A second implementation would drift, and the calendar
 * would suggest a train the planner does not open on.
 */
function suggestTrip(
  windowId: string,
  pilot: { crewId: string; airportTransferMinutes: number },
  offWindow: { startAt: Date; endAt: Date; travelEligible: boolean },
  outboundCandidates: TrainOption[],
  returnCandidates: TrainOption[],
): { outboundTrain: SerializedTrainOption; returnTrain: SerializedTrainOption } | null {
  const view = assembleOffWindowView({
    windowId,
    pilot: {
      crewId: pilot.crewId,
      homeCity: null,
      homeStationCode: null,
      homeStationName: null,
      airportTransferMinutes: pilot.airportTransferMinutes,
    },
    offWindow,
    precedingRestEndsAt: null,
    commitment: null,
    destinations: [],
    outboundCandidates,
    returnCandidates,
  });

  const outboundTrain = view.outboundOptions[view.initialOutboundIndex];
  const returnTrain = view.returnOptions[view.initialReturnIndex];
  if (!outboundTrain || !returnTrain) return null;

  // A suggestion that does not physically work is worse than no suggestion: the pilot would have
  // to reason out why the bars on their calendar are impossible.
  const feasibility = evaluateCommuteFeasibility(
    view.travel,
    toDatedTrainOption(outboundTrain),
    toDatedTrainOption(returnTrain),
  );
  if (!feasibility.isFeasible) return null;

  return { outboundTrain, returnTrain };
}

/** Everything the roster page's header needs, and nothing that costs a timetable search. */
export interface RosterCalendarHeader {
  crewId: string;
  name: string;
  aircraftType: string | null;
  /** Null when the pilot exists but has uploaded nothing yet. */
  period: string | null;
  hasSchedule: boolean;
}

/**
 * The pilot and the period, from two indexed reads and nothing else.
 *
 * Split out for the same reason `buildOffWindowHeader` is, and it matters more here: the calendar
 * is the roster's *default* view, and `buildRosterCalendarView` below spends its time on live
 * requests to an endpoint that is allowed to fail slowly. Awaiting the whole thing before the
 * first byte left the server made a cold cache look like a broken page. The header paints, the
 * grid streams in behind a Suspense boundary.
 */
export async function buildRosterCalendarHeader(
  crewId: string,
): Promise<RosterCalendarHeader | null> {
  const pilot = await prisma.pilot.findUnique({
    where: { crewId },
    select: { id: true, crewId: true, name: true, aircraftType: true },
  });
  if (!pilot) return null;

  const schedule = await prisma.scheduleUpload.findFirst({
    where: { pilotId: pilot.id },
    orderBy: { uploadedAt: "desc" },
    select: { period: true },
  });

  return {
    crewId: pilot.crewId,
    name: pilot.name,
    aircraftType: pilot.aircraftType,
    period: schedule?.period ?? null,
    hasSchedule: schedule !== null,
  };
}

/**
 * Loads and assembles the view. Null when no pilot has that crew id.
 *
 * Note the cost: every window that clears `windowsWorthSuggesting` is a timetable search in both
 * directions. The provider caches per route and date for ten minutes and batches its day
 * requests, so a second look at the month is cheap, but the first render of a roster with several
 * open windows is not. That is the price of the gaps answering "could I get home in this" — and
 * why the page awaits `buildRosterCalendarHeader` instead and suspends on this one, so nothing
 * above the grid ever waits on TCDD.
 */
export async function buildRosterCalendarView(
  crewId: string,
  now: Date = new Date(),
): Promise<RosterCalendarView | null> {
  const pilot = await prisma.pilot.findUnique({ where: { crewId } });
  if (!pilot) return null;

  const schedule = await prisma.scheduleUpload.findFirst({
    where: { pilotId: pilot.id },
    orderBy: { uploadedAt: "desc" },
    include: {
      dutyPeriods: { orderBy: { sortIndex: "asc" } },
      offWindows: { orderBy: { startAt: "asc" }, include: { commitment: true } },
    },
  });

  if (!schedule) {
    return assembleRosterCalendarView({ pilot, schedule: null });
  }

  const committed: RosterCalendarTripInput[] = schedule.offWindows.flatMap((window) =>
    window.commitment
      ? [
          {
            id: window.commitment.id,
            // Unchecked casts, as everywhere these JSON columns are read — see CLAUDE.md.
            outboundTrain: window.commitment.outboundTrain as unknown as SerializedTrainOption,
            returnTrain: window.commitment.returnTrain as unknown as SerializedTrainOption,
            windowStartAt: window.startAt,
            windowEndAt: window.endAt,
            cancelledAt: window.commitment.cancelledAt,
            isCommitted: true,
          },
        ]
      : [],
  );

  const suggested: RosterCalendarTripInput[] = [];

  if (pilot.homeStationCode) {
    // One window at a time: each already fans out over the days it touches, and running the whole
    // month at once is how an unofficial endpoint starts refusing us.
    for (const window of windowsWorthSuggesting(schedule.offWindows, pilot, now)) {
      const travel = computeTravelWindow(window, pilot.airportTransferMinutes);
      const [outboundCandidates, returnCandidates] = await Promise.all([
        searchTrainsInWindow(
          trainProvider,
          "IST",
          pilot.homeStationCode,
          travel.startAt,
          travel.endAt,
          MAX_DAYS_TO_SEARCH,
        ),
        searchTrainsInWindow(
          trainProvider,
          pilot.homeStationCode,
          "IST",
          travel.startAt,
          travel.endAt,
          MAX_DAYS_TO_SEARCH,
        ),
      ]);

      const trip = suggestTrip(window.id, pilot, window, outboundCandidates, returnCandidates);
      if (trip) {
        suggested.push({
          id: `suggested:${window.id}`,
          ...trip,
          windowStartAt: window.startAt,
          windowEndAt: window.endAt,
          cancelledAt: null,
          isCommitted: false,
        });
      }
    }
  }

  return assembleRosterCalendarView({
    pilot,
    schedule: {
      period: schedule.period,
      duties: schedule.dutyPeriods,
      trips: [...committed, ...suggested],
    },
  });
}
