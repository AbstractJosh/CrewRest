/**
 * Everything the pilot's schedule page needs: the latest upload's off-windows, partitioned into the
 * ones worth showing as commute opportunities and the ones below the pilot's threshold.
 *
 * The duty periods themselves are not here. They are the whole of `pilotRosterView`, which the roster
 * page reads instead — a schedule that loaded them would be paying for a list nothing renders.
 *
 * Split the same way as `offWindowView` — a pure `assemble` with a thin `build` around it — for the
 * same two reasons: the partition is worth testing without a database, and a route handler should
 * be able to serve this to a client that isn't rendering React.
 */

import { prisma } from "@/lib/prisma";
import { computeTravelWindow, type TravelWindow } from "@/lib/schedule/travelWindow";

/** Only the pilot fields this view reads — so a test needn't build a whole Prisma row. */
export interface PilotScheduleViewPilot {
  crewId: string;
  name: string;
  aircraftType: string | null;
  minOffHours: number;
  airportTransferMinutes: number;
}

export interface ScheduleOffWindowInput {
  id: string;
  startAt: Date;
  endAt: Date;
  travelEligible: boolean;
  /**
   * The window's commitment, if one was ever made. Only `cancelledAt` is read: the schedule page
   * says *whether* there is a plan, never which trains it holds.
   */
  commitment: { cancelledAt: Date | null } | null;
}

export interface PilotScheduleViewInput {
  pilot: PilotScheduleViewPilot;
  schedule: {
    period: string;
    offWindows: ScheduleOffWindowInput[];
  } | null;
  /**
   * Taken as an input rather than read here, for the same reason `assemblePlansView` does it: a
   * pure assembler that called the clock itself would partition differently depending on when
   * its tests ran. The system clock is the right source — this only needs "roughly now" to the
   * nearest window, and every comparison below is between absolute instants, so the host's own
   * timezone never enters into it.
   */
  now: Date;
}

/**
 * Where a window stands with the pilot: nothing planned yet, a live plan, or a plan they dropped.
 *
 * Same three names the ticket spine uses, so the page maps this straight onto an accent without a
 * lookup table in the middle. The union lives here rather than being imported from the component:
 * `src/lib` stays framework-free, and this is a fact about the window, not about how it is drawn.
 */
export type WindowPlanState = "open" | "committed" | "dropped";

export interface ScheduleWindowView {
  id: string;
  /** Duty release (MS) — the raw start of the gap, before the transfer buffer. */
  dutyEndsAt: Date;
  travelEligible: boolean;
  travel: TravelWindow;
  planState: WindowPlanState;
}

export interface PilotScheduleView {
  crewId: string;
  name: string;
  aircraftType: string | null;
  minOffHours: number;
  airportTransferMinutes: number;
  /** Null when the pilot exists but has uploaded nothing yet. */
  period: string | null;
  hasSchedule: boolean;
  shownWindows: ScheduleWindowView[];
  hiddenWindows: ScheduleWindowView[];
  /**
   * How many windows were dropped for being over. Surfaced as a count, not a list: the page has
   * to be able to say *why* a roster's first half is missing, or a pilot opening a part-used
   * month reads the gap as lost data.
   */
  pastWindowCount: number;
}

export function assemblePilotScheduleView(
  input: PilotScheduleViewInput,
): PilotScheduleView {
  const { pilot, schedule } = input;

  // The threshold applies to time actually available for travelling, not the raw gap: a 20h
  // gap with a 1h30 transfer at each end is not a 20h trip opportunity.
  const minOffMinutes = pilot.minOffHours * 60;

  const windows: ScheduleWindowView[] = (schedule?.offWindows ?? []).map((w) => ({
    id: w.id,
    dutyEndsAt: w.startAt,
    travelEligible: w.travelEligible,
    travel: computeTravelWindow(w, pilot.airportTransferMinutes),
    // A cancelled row is kept rather than deleted (see CLAUDE.md), so "has a commitment" is not
    // the same question as "has a plan" — check cancelledAt, not the row's existence.
    planState: !w.commitment ? "open" : w.commitment.cancelledAt === null ? "committed" : "dropped",
  }));

  /*
   * Measured against the window's hard deadline — the next report time, which the transfer buffer
   * never moves — not its start, so a window already under way still counts: the pilot can catch
   * a later train in it. A window whose deadline is exactly now is over here; `assemblePlansView`
   * leaves a plan under Upcoming for that same instant, on the grounds that a trip the pilot has
   * already committed to and paid for is worth keeping in front of them until it has visibly
   * elapsed. The two only disagree on the single instant of equality.
   */
  const isOver = (w: ScheduleWindowView) => w.travel.endAt.getTime() <= input.now.getTime();
  const live = windows.filter((w) => !isOver(w));

  const isWorthShowing = (w: ScheduleWindowView) =>
    w.travel.isViable && w.travel.minutes >= minOffMinutes;

  return {
    crewId: pilot.crewId,
    name: pilot.name,
    aircraftType: pilot.aircraftType,
    minOffHours: pilot.minOffHours,
    airportTransferMinutes: pilot.airportTransferMinutes,
    period: schedule?.period ?? null,
    hasSchedule: schedule !== null,
    shownWindows: live.filter(isWorthShowing),
    hiddenWindows: live.filter((w) => !isWorthShowing(w)),
    pastWindowCount: windows.length - live.length,
  };
}

/**
 * The crew id of whoever uploaded most recently, or null when nobody has uploaded at all.
 *
 * The schedule pages are URLs keyed to a crew id and there is no session to remember one, so a
 * page that isn't already under /pilot/ has no way to name a pilot. The most recent upload is the
 * only answer available without inventing an identity, and on the single-pilot case CrewRest is
 * actually used for it is the right one. `/schedule` and `/roster` exist to ask this question.
 */
export async function findLatestPilotCrewId(): Promise<string | null> {
  const latest = await prisma.scheduleUpload.findFirst({
    orderBy: { uploadedAt: "desc" },
    select: { pilot: { select: { crewId: true } } },
  });
  return latest?.pilot.crewId ?? null;
}

/** Loads and assembles the view. Null when no pilot has that crew id. */
export async function buildPilotScheduleView(
  crewId: string,
  now: Date = new Date(),
): Promise<PilotScheduleView | null> {
  const pilot = await prisma.pilot.findUnique({ where: { crewId } });
  if (!pilot) return null;

  const schedule = await prisma.scheduleUpload.findFirst({
    where: { pilotId: pilot.id },
    orderBy: { uploadedAt: "desc" },
    include: {
      offWindows: {
        orderBy: { startAt: "asc" },
        include: { commitment: { select: { cancelledAt: true } } },
      },
    },
  });

  return assemblePilotScheduleView({ pilot, schedule, now });
}
