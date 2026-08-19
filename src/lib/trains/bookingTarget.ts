/**
 * What the pilot has to look for once the booking link opens.
 *
 * The hand-off in `booking.ts` can only carry six query variables — the two stations, the date,
 * the passenger count and the trip type — because that is all ebilet's own redirect component
 * parses, and its result list never reads route params. So the link lands on the right *day's*
 * departures and stops there: it cannot preselect a train or open a seat map, and that ceiling is
 * ebilet's, not something this side can raise.
 *
 * What is left is making the target row unmistakable by printing the same tokens ebilet prints on
 * it. Its card headline is the API's `train.name` ("81034 İSTANBUL-ANKARA"), whose leading token
 * is exactly our `trainNumber`; it renders times as HH:mm; and its price is the cheapest fare,
 * which is the one already shown in the picker. No new data, nothing new to keep in sync.
 */

import { formatTurkeyDateKeyLabel, formatTurkeyTime, turkeyDateKey } from "@/lib/time/turkeyTime";
import { EBILET_SEARCH_URL } from "@/lib/trains/booking";
import { cheapestFare, formatFare } from "@/lib/trains/fares";
import type { SerializedTrainOption } from "@/lib/trains/serialized";

export interface BookingTarget {
  /** One sentence, ready to render under the booking link. */
  caption: string;
}

/** Structural, so a caller holding a `TrainOption`-shaped row need not build a whole option. */
export type BookingTargetInput = Pick<
  SerializedTrainOption,
  "trainNumber" | "departureAt" | "arrivalAt" | "source" | "fares" | "bookingUrl"
>;

export function describeBookingTarget(option: BookingTargetInput): BookingTarget {
  const departureAt = new Date(option.departureAt);
  const arrivalAt = new Date(option.arrivalAt);

  // The same key the URL's `gidisTarih` carries, labelled rather than re-derived. The pilot gets
  // no other signal about which day opens, and the case that needs one is a 00:40 departure out
  // of a window that started the previous evening: the link opens *tomorrow*.
  const day = formatTurkeyDateKeyLabel(turkeyDateKey(departureAt));
  const times = `${formatTurkeyTime(departureAt)} → ${formatTurkeyTime(arrivalAt)}`;

  /*
   * `buildBookingUrl` degrades to the bare ebilet home page on an unmapped station or a broken
   * template, and the caption has to degrade with it: "Opens Sun 23 Aug" printed under a link
   * that lands on an empty search form is a claim the pilot can only disprove by missing a train.
   * The URL is the only evidence of the degradation, which is why it is an input here.
   */
  const lead =
    option.bookingUrl === EBILET_SEARCH_URL
      ? `Search ebilet for ${day} —`
      : `Opens ${day} on ebilet —`;

  // Branching on the source, never on whether a train number happens to be present: the curated
  // timetable synthesizes its numbers from list position (see `findCommittedIndex`), so printing
  // one would send the pilot hunting for a row that does not exist.
  if (option.source === "estimate") {
    return {
      caption:
        `${lead} ${times} is an approximate planning estimate, not a live feed, so confirm ` +
        `the real departure there.`,
    };
  }

  const parts = [`look for ${times}`];
  if (option.trainNumber) parts.push(`train ${option.trainNumber}`);

  const fare = cheapestFare(option);
  if (fare) parts.push(formatFare(fare));

  return { caption: `${lead} ${parts.join(", ")}.` };
}
