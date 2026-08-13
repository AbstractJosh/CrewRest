/**
 * Everything the off-window planner page needs, assembled in one place.
 *
 * This used to live inside the page's server component, which meant the only way to exercise it
 * was to render a React tree against a real database. It is split in two here:
 *
 *   assembleOffWindowView  — pure and synchronous: filtering, choosing, serializing, matching.
 *   buildOffWindowView     — the I/O around it: two Prisma queries and the timetable search.
 *
 * The split is what makes the interesting behaviour testable, and it is also what lets a second
 * client reach this: a route handler can return the view as JSON without rendering anything.
 */

import { prisma } from "@/lib/prisma";
import { computeTravelWindow, type TravelWindow } from "@/lib/schedule/travelWindow";
import {
  trainProvider,
  searchTrainsInWindow,
  type TrainOption,
  type TrainStation,
} from "@/lib/trains";
import {
  findCommittedIndex,
  serializeTrainOption,
  type SerializedTrainOption,
} from "@/lib/trains/serialized";
import {
  chooseOutbound,
  isAlightable,
  isBoardable,
  type OutboundChoice,
} from "@/lib/trains/reachability";

/**
 * How many days of timetable to pull for one window. Against a live provider each day is an HTTP
 * request, and a gap long enough to be worth commuting home for is measured in days, not weeks —
 * so the static provider's month-wide default buys nothing here.
 */
export const MAX_DAYS_TO_SEARCH = 8;

/** Only the pilot fields this view reads — so a test needn't build a whole Prisma row. */
export interface OffWindowViewPilot {
  crewId: string;
  homeCity: string | null;
  homeStationCode: string | null;
  homeStationName: string | null;
  airportTransferMinutes: number;
}

export interface OffWindowViewInput {
  windowId: string;
  pilot: OffWindowViewPilot;
  offWindow: { startAt: Date; endAt: Date; travelEligible: boolean };
  /** `restEndsAt` of the duty preceding this window, unfiltered. Null for a day-off block. */
  precedingRestEndsAt: Date | null;
  commitment: {
    outboundTrain: SerializedTrainOption;
    returnTrain: SerializedTrainOption;
    bookingReference: string | null;
  } | null;
  destinations: TrainStation[];
  /** Raw search results, before reachability and sold-out filtering. */
  outboundCandidates: TrainOption[];
  returnCandidates: TrainOption[];
}

export interface OffWindowView {
  crewId: string;
  windowId: string;
  /** Label for the destination end of the trip. */
  homeCity: string;
  /** Null until the pilot picks a home city — the page asks for one instead of planning. */
  homeStationCode: string | null;
  airportTransferMinutes: number;
  travelEligible: boolean;
  /** Duty release (MS) — the raw start of the gap, before the transfer buffer. */
  dutyEndsAt: Date;
  /** Next report time (MB). */
  reportBackAt: Date;
  travel: TravelWindow;
  /**
   * End of minimum rest, when it falls after the window opens. Context only: it constrains when
   * the airline may roster the pilot again, never when the pilot may travel, so it must not
   * shorten the window. Null when it has already passed or the block was a day off.
   */
  restEndsAt: Date | null;
  destinations: TrainStation[];
  outboundOptions: SerializedTrainOption[];
  returnOptions: SerializedTrainOption[];
  initialOutboundIndex: number;
  initialReturnIndex: number;
  outboundChoice: OutboundChoice | null;
  isCommitted: boolean;
  bookingReference: string;
}

export function assembleOffWindowView(input: OffWindowViewInput): OffWindowView {
  const { pilot, offWindow, commitment } = input;

  const travel = computeTravelWindow(offWindow, pilot.airportTransferMinutes);

  const restEndsAt =
    input.precedingRestEndsAt &&
    input.precedingRestEndsAt.getTime() > offWindow.startAt.getTime()
      ? input.precedingRestEndsAt
      : null;

  // A train in the timetable isn't necessarily one you can get to: the feeder metro bounds
  // when you can board in Istanbul, and the return has to land early enough to still reach
  // the airport before report time. And a sold-out train is not a way home at all — when the
  // provider reports availability, drop those before they can be chosen.
  const outboundOptions = input.outboundCandidates.filter(
    (t) => isBoardable(t.departureAt) && t.isSoldOut !== true,
  );
  const returnOptions = input.returnCandidates.filter(
    (t) =>
      isAlightable(t.arrivalAt) &&
      t.arrivalAt.getTime() <= travel.latestReturnArrivalAt.getTime() &&
      t.isSoldOut !== true,
  );

  const serializedOutbound = outboundOptions.map(serializeTrainOption);
  const serializedReturn = returnOptions.map(serializeTrainOption);

  // Leave on the first train that doesn't strand you at the station, come home on the last
  // one that still clears the transfer back to the airport.
  const outboundChoice = chooseOutbound(outboundOptions, travel.startAt);
  let initialOutboundIndex = outboundChoice?.index ?? 0;
  let initialReturnIndex = Math.max(serializedReturn.length - 1, 0);

  if (commitment) {
    const matchedOutbound = findCommittedIndex(serializedOutbound, commitment.outboundTrain);
    const matchedReturn = findCommittedIndex(serializedReturn, commitment.returnTrain);
    if (matchedOutbound >= 0) initialOutboundIndex = matchedOutbound;
    if (matchedReturn >= 0) initialReturnIndex = matchedReturn;
  }

  return {
    crewId: pilot.crewId,
    windowId: input.windowId,
    homeCity: pilot.homeCity ?? pilot.homeStationName ?? "home",
    homeStationCode: pilot.homeStationCode,
    airportTransferMinutes: pilot.airportTransferMinutes,
    travelEligible: offWindow.travelEligible,
    dutyEndsAt: offWindow.startAt,
    reportBackAt: offWindow.endAt,
    travel,
    restEndsAt,
    destinations: input.destinations,
    outboundOptions: serializedOutbound,
    returnOptions: serializedReturn,
    initialOutboundIndex,
    initialReturnIndex,
    outboundChoice,
    isCommitted: Boolean(commitment),
    bookingReference: commitment?.bookingReference ?? "",
  };
}

/**
 * Loads and assembles the view. Null when the window doesn't exist or belongs to another pilot —
 * the caller decides whether that is a 404 or a JSON error.
 */
export async function buildOffWindowView(
  crewId: string,
  windowId: string,
): Promise<OffWindowView | null> {
  const offWindow = await prisma.offWindow.findUnique({
    where: { id: windowId },
    include: { schedule: { include: { pilot: true } }, commitment: true },
  });
  if (!offWindow || offWindow.schedule.pilot.crewId !== crewId) return null;

  const pilot = offWindow.schedule.pilot;

  // The duty this window follows. OffWindow has no FK to it, but a window always starts at the
  // preceding duty's release time, so the latest duty ending at or before the window start is it.
  const precedingDuty = await prisma.dutyPeriod.findFirst({
    where: {
      scheduleId: offWindow.scheduleId,
      endAt: { lte: offWindow.startAt },
    },
    orderBy: { endAt: "desc" },
  });

  const travel = computeTravelWindow(offWindow, pilot.airportTransferMinutes);

  let outboundCandidates: TrainOption[] = [];
  let returnCandidates: TrainOption[] = [];
  if (pilot.homeStationCode) {
    [outboundCandidates, returnCandidates] = await Promise.all([
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
  }

  return assembleOffWindowView({
    windowId,
    pilot,
    offWindow,
    precedingRestEndsAt: precedingDuty?.restEndsAt ?? null,
    commitment: offWindow.commitment
      ? {
          // Unchecked casts, as everywhere these JSON columns are read — see CLAUDE.md.
          outboundTrain: offWindow.commitment.outboundTrain as unknown as SerializedTrainOption,
          returnTrain: offWindow.commitment.returnTrain as unknown as SerializedTrainOption,
          bookingReference: offWindow.commitment.bookingReference,
        }
      : null,
    destinations: trainProvider.listDestinationsFromIstanbul(),
    outboundCandidates,
    returnCandidates,
  });
}
