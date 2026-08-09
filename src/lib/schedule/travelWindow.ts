/**
 * Phase 1 of the build spec: turning a raw gap between duty blocks into the window in which
 * the crew member can actually travel home.
 *
 * A stored `OffWindow` is the raw gap — duty release (MS) to the next report time (MB). That
 * is not the same as time available to travel: you can't leave the airport the instant the
 * duty ends, and you have to be back at the airport before report time. Both ends are eaten
 * by the same airport↔station transfer, which is a per-pilot setting rather than a constant.
 *
 * The buffer is applied here, at read time, rather than baked into what `computeOffWindows`
 * stores — the same reasoning as `Pilot.minOffHours`. A pilot changing their transfer time
 * should not require re-uploading the roster.
 */

export interface TravelWindow {
  /** Earliest the pilot can be moving: duty release + transfer. The spec's `home_arrival_time`. */
  startAt: Date;
  /** Hard deadline — the next duty's report time. */
  endAt: Date;
  /** Minutes from `startAt` to `endAt`. */
  minutes: number;
  /**
   * Latest a return train may reach Istanbul and still leave time to get to the airport.
   * This is where the spec's "−2:00 before the next flight" lands: applied to the return
   * journey rather than trimmed off the displayed window.
   */
  latestReturnArrivalAt: Date;
  /** False when the buffers swallow the gap entirely — no round trip is possible. */
  isViable: boolean;
}

export function computeTravelWindow(
  offWindow: { startAt: Date; endAt: Date },
  airportTransferMinutes: number,
): TravelWindow {
  const transferMs = airportTransferMinutes * 60_000;
  const startAt = new Date(offWindow.startAt.getTime() + transferMs);
  const endAt = offWindow.endAt;
  const latestReturnArrivalAt = new Date(endAt.getTime() - transferMs);

  return {
    startAt,
    endAt,
    minutes: Math.round((endAt.getTime() - startAt.getTime()) / 60_000),
    latestReturnArrivalAt,
    isViable: latestReturnArrivalAt.getTime() > startAt.getTime(),
  };
}
