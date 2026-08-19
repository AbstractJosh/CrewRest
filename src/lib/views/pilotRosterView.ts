/**
 * The roster as flown: every duty period of the pilot's latest upload, in roster order.
 *
 * Split out of `pilotScheduleView` when the duty list moved off the schedule page onto its own.
 * The two answer different questions — "when can I go home" against "what am I actually flying" —
 * and neither page has any use for the other's query: this one never touches off-windows or
 * commitments, and the schedule no longer loads duties.
 *
 * Split the same way as the other builders — a pure `assemble` with a thin `build` around it —
 * for the same reasons: the JSON column's resolution is worth testing without a database, and a
 * route handler should be able to serve this to a client that isn't rendering React.
 */

import { prisma } from "@/lib/prisma";
import type { FlightLeg } from "@/lib/pdf/scheduleParser";

/** Only the pilot fields this view reads — so a test needn't build a whole Prisma row. */
export interface PilotRosterViewPilot {
  crewId: string;
  name: string;
  aircraftType: string | null;
}

export interface RosterDutyPeriodInput {
  id: string;
  startAt: Date;
  endAt: Date;
  type: string;
  rawCode: string;
  flightLegs: unknown;
}

export interface PilotRosterViewInput {
  pilot: PilotRosterViewPilot;
  schedule: {
    period: string;
    dutyPeriods: RosterDutyPeriodInput[];
  } | null;
}

export interface RosterDutyView {
  id: string;
  /** Report for duty (MB) and duty release (MS) — the span the roster prints, not the rest end. */
  startAt: Date;
  endAt: Date;
  type: string;
  rawCode: string;
  /** The JSON column resolved once here rather than cast in the component. */
  flightLegs: FlightLeg[];
}

export interface PilotRosterView {
  crewId: string;
  name: string;
  aircraftType: string | null;
  /** Null when the pilot exists but has uploaded nothing yet. */
  period: string | null;
  hasSchedule: boolean;
  dutyPeriods: RosterDutyView[];
}

export function assemblePilotRosterView(input: PilotRosterViewInput): PilotRosterView {
  const { pilot, schedule } = input;

  return {
    crewId: pilot.crewId,
    name: pilot.name,
    aircraftType: pilot.aircraftType,
    period: schedule?.period ?? null,
    hasSchedule: schedule !== null,
    // Deliberately unfiltered and unsorted beyond the roster's own order: this page is the
    // printed roster, and a pilot checking what they flew last week needs the past kept.
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
export async function buildPilotRosterView(crewId: string): Promise<PilotRosterView | null> {
  const pilot = await prisma.pilot.findUnique({ where: { crewId } });
  if (!pilot) return null;

  const schedule = await prisma.scheduleUpload.findFirst({
    where: { pilotId: pilot.id },
    orderBy: { uploadedAt: "desc" },
    include: { dutyPeriods: { orderBy: { sortIndex: "asc" } } },
  });

  return assemblePilotRosterView({ pilot, schedule });
}
