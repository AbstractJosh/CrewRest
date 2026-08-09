import type { TrainOption, TrainProvider } from "@/lib/trains/TrainProvider";
import { TURKEY_UTC_OFFSET_MINUTES } from "@/lib/time/turkeyTime";

/** Guards against a malformed window producing an unbounded number of provider calls. */
const MAX_DAYS_SEARCHED = 31;

const DAY_MS = 24 * 60 * 60_000;

/** Midnight Turkey-local, as a UTC instant, for the day the given instant falls on. */
function turkeyMidnight(date: Date): Date {
  const shifted = new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
  const midnightShiftedMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightShiftedMs - TURKEY_UTC_OFFSET_MINUTES * 60_000);
}

/**
 * Every train on a route that fits entirely inside an off-window.
 *
 * `TrainProvider.searchTrains` returns a single calendar day's departures, but an off-window
 * routinely spans several days — and, now that windows start at duty release rather than at
 * the end of the mandatory rest period, often starts late at night with no usable departures
 * left that day. So query each Turkey-local date the window touches and keep what fits.
 */
export async function searchTrainsInWindow(
  provider: TrainProvider,
  originCode: string,
  destinationCode: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<TrainOption[]> {
  const firstDay = turkeyMidnight(windowStart);
  const lastDay = turkeyMidnight(windowEnd);
  const dayCount = Math.min(
    Math.round((lastDay.getTime() - firstDay.getTime()) / DAY_MS) + 1,
    MAX_DAYS_SEARCHED,
  );
  if (dayCount < 1) return [];

  const perDay = await Promise.all(
    Array.from({ length: dayCount }, (_, i) =>
      provider.searchTrains(
        originCode,
        destinationCode,
        new Date(firstDay.getTime() + i * DAY_MS),
      ),
    ),
  );

  return perDay
    .flat()
    .filter(
      (train) =>
        train.departureAt.getTime() >= windowStart.getTime() &&
        train.arrivalAt.getTime() <= windowEnd.getTime(),
    )
    .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
}
