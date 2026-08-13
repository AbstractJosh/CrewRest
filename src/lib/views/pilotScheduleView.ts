/**
 * Everything the pilot's schedule page needs: the latest upload's duty periods, and its off-windows
 * partitioned into the ones worth showing as commute opportunities and the ones below the pilot's
 * threshold.
 *
 * Split the same way as `offWindowView` — a pure `assemble` with a thin `build` around it — for the
 * same two reasons: the partition is worth testing without a database, and a route handler should
 * be able to serve this to a client that isn't rendering React.
 */

import { prisma } from "@/lib/prisma";
import { computeTravelWindow, type TravelWindow } from "@/lib/schedule/travelWindow";
import type { FlightLeg } from "@/lib/pdf/scheduleParser";

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
}

export interface ScheduleDutyPeriodInput {
  id: string;
  startAt: Date;
  endAt: Date;
  type: string;
  rawCode: string;
  flightLegs: unknown;
}

export interface PilotScheduleViewInput {
  pilot: PilotScheduleViewPilot;
  schedule: {
    period: string;
    offWindows: ScheduleOffWindowInput[];
    dutyPeriods: ScheduleDutyPeriodInput[];
  } | null;
}

export interface ScheduleWindowView {
  id: string;
  /** Duty release (MS) — the raw start of the gap, before the transfer buffer. */
  dutyEndsAt: Date;
  travelEligible: boolean;
  travel: TravelWindow;
}

export interface ScheduleDutyView {
  id: string;
  startAt: Date;
  endAt: Date;
  type: string;
  rawCode: string;
  /** The JSON column resolved once here rather than cast in the component. */
  flightLegs: FlightLeg[];
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
  dutyPeriods: ScheduleDutyView[];
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
  }));

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
    shownWindows: windows.filter(isWorthShowing),
    hiddenWindows: windows.filter((w) => !isWorthShowing(w)),
    dutyPeriods: (schedule?.dutyPeriods ?? []).map((duty) => ({
      id: duty.id,
      startAt: duty.startAt,
      endAt: duty.endAt,
      type: duty.type,
      rawCode: duty.rawCode,
      // Unchecked cast, as everywhere this JSON column is read — see CLAUDE.md.
      flightLegs: (duty.flightLegs as FlightLeg[] | null) ?? [],
    })),
  };
}

/** Loads and assembles the view. Null when no pilot has that crew id. */
export async function buildPilotScheduleView(
  crewId: string,
): Promise<PilotScheduleView | null> {
  const pilot = await prisma.pilot.findUnique({ where: { crewId } });
  if (!pilot) return null;

  const schedule = await prisma.scheduleUpload.findFirst({
    where: { pilotId: pilot.id },
    orderBy: { uploadedAt: "desc" },
    include: {
      dutyPeriods: { orderBy: { sortIndex: "asc" } },
      offWindows: { orderBy: { startAt: "asc" } },
    },
  });

  return assemblePilotScheduleView({ pilot, schedule });
}
