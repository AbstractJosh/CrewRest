/**
 * The over-the-wire shape of a `TrainOption`.
 *
 * `TrainOption` carries `Date`s, which don't survive JSON. This is the same option with the
 * instants as ISO strings and the booking link already resolved — resolved on the server because
 * `buildBookingUrl` reads `TCDD_BOOKING_URL_TEMPLATE` from the environment.
 *
 * It lives here rather than beside the component that renders it because it is a contract, not a
 * presentation detail: it is what crosses to a client, and it is what is stored in
 * `CommuteCommitment.outboundTrain` / `returnTrain`. A second client — a native app talking to
 * this server — has to be able to import it without importing web markup.
 *
 * Changing this shape means migrating stored commitments or handling both (see CLAUDE.md → Data
 * model: those JSON columns are cast unchecked on read).
 */

import { buildBookingUrl } from "@/lib/trains/booking";
import type { TrainDataSource, TrainFare, TrainOption } from "@/lib/trains/TrainProvider";

export interface SerializedTrainOption {
  trainNumber: string;
  originCode: string;
  destinationCode: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  source: TrainDataSource;
  providerTrainId?: string;
  fares?: TrainFare[];
  availableSeats?: number;
  isSoldOut?: boolean;
  /** Resolved on the server, where the booking-link template lives. */
  bookingUrl: string;
}

export function serializeTrainOption(option: TrainOption): SerializedTrainOption {
  return {
    ...option,
    departureAt: option.departureAt.toISOString(),
    arrivalAt: option.arrivalAt.toISOString(),
    bookingUrl: buildBookingUrl(option),
  };
}

/** Back to `Date`s, for the pure functions that reason about instants. */
export function toDatedTrainOption(option: SerializedTrainOption): TrainOption {
  return {
    ...option,
    departureAt: new Date(option.departureAt),
    arrivalAt: new Date(option.arrivalAt),
  };
}

/**
 * Finds a committed train among the options currently offered.
 *
 * Prefers the provider's own id, which survives a timetable edit. A commitment made against the
 * curated timetable has no such id — and its train number is synthesized from list position, so
 * it moves if the data changes — hence the departure-time fallback.
 *
 * Returns -1 when the committed train is no longer on offer, which is a real outcome: a sold-out
 * or withdrawn train drops out of the list between committing and coming back to the page.
 */
export function findCommittedIndex(
  options: SerializedTrainOption[],
  committed: SerializedTrainOption,
): number {
  if (committed.providerTrainId) {
    const byId = options.findIndex((o) => o.providerTrainId === committed.providerTrainId);
    if (byId >= 0) return byId;
  }
  return options.findIndex(
    (o) =>
      o.trainNumber === committed.trainNumber && o.departureAt === committed.departureAt,
  );
}
