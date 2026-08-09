/**
 * Phase 2 of the build spec: which trains the crew member can physically get to.
 *
 * The YHT station is reached by a feeder metro that only runs 06:00–24:00, so a train
 * existing in the timetable does not mean it is catchable. The spec states the consequence
 * directly: the earliest usable departure is ~07:30 and the latest ~01:30.
 */

import { TURKEY_UTC_OFFSET_MINUTES } from "@/lib/time/turkeyTime";
import type { TrainOption } from "@/lib/trains/TrainProvider";

/** Feeder metro service hours, Türkiye local. */
const METRO_FIRST_SERVICE_MINUTES = 6 * 60; // 06:00

/** Earliest departure reachable once the metro starts running. */
const EARLIEST_BOARDING_MINUTES = 7 * 60 + 30; // 07:30
/** Latest departure still reachable on the last metro of the night (past midnight). */
const LATEST_BOARDING_MINUTES = 1 * 60 + 30; // 01:30

/** Longer than this hanging around the station and the pilot would just go home instead. */
export const MAX_STATION_WAIT_MINUTES = 2 * 60;

function turkeyMinutesOfDay(date: Date): number {
  const shifted = new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/**
 * Can the pilot reach the station in time to board? The reachable band wraps past midnight
 * (07:30 → 01:30), so this is an OR rather than the usual range test.
 */
export function isBoardable(departureAt: Date): boolean {
  const minutes = turkeyMinutesOfDay(departureAt);
  return minutes >= EARLIEST_BOARDING_MINUTES || minutes <= LATEST_BOARDING_MINUTES;
}

/**
 * Can the pilot get *out* of the station on arrival? Landing back in Istanbul at 03:00 with
 * no metro running is no use when the airport is the next stop.
 */
export function isAlightable(arrivalAt: Date): boolean {
  return turkeyMinutesOfDay(arrivalAt) >= METRO_FIRST_SERVICE_MINUTES;
}

export interface OutboundChoice {
  index: number;
  /** Minutes between being free to travel and this train departing. */
  waitMinutes: number;
  /** True when nothing departs within MAX_STATION_WAIT_MINUTES of the pilot being free. */
  isLongWait: boolean;
}

/**
 * Picks the outbound train to preselect: the earliest one that doesn't strand the pilot at
 * the station for more than MAX_STATION_WAIT_MINUTES.
 *
 * The spec says to "roll over to checking the next day" when nothing fits that wait. Because
 * the caller already searches every day the window spans, rolling over happens naturally —
 * the earliest acceptable train simply lands on a later date. When even that isn't possible
 * (e.g. duty ends at 01:15 and the first reachable train is 07:30), we still return the
 * earliest option but mark it `isLongWait` so the UI can say the pilot would head home first
 * rather than wait it out.
 */
export function chooseOutbound(
  trains: TrainOption[],
  readyAt: Date,
): OutboundChoice | null {
  if (trains.length === 0) return null;

  const waits = trains.map((train) =>
    Math.round((train.departureAt.getTime() - readyAt.getTime()) / 60_000),
  );
  const acceptable = waits.findIndex(
    (wait) => wait >= 0 && wait <= MAX_STATION_WAIT_MINUTES,
  );
  const index = acceptable >= 0 ? acceptable : 0;

  return {
    index,
    waitMinutes: waits[index],
    isLongWait: acceptable < 0,
  };
}
