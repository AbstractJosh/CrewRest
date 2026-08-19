/**
 * Picking and printing the headline fare.
 *
 * ebilet's own result card leads with the cheapest class it can sell, so the caption that tells a
 * pilot which row to look for has to name the same number the row does. That makes this shared
 * rather than presentational: the picker's option labels and the booking caption must agree.
 */

import type { TrainFare } from "@/lib/trains/TrainProvider";

/**
 * The headline fare, or null when the provider quoted no usable price.
 *
 * Unpriced rows are skipped rather than compared: a stored fare whose `priceMinor` came back
 * from the JSON column as null or NaN (`JSON.stringify(NaN)` is `"null"`) would win every
 * comparison against a real price and advertise a free ticket.
 */
export function cheapestFare(option: { fares?: TrainFare[] }): TrainFare | null {
  const priced = (option.fares ?? []).filter((fare) => Number.isFinite(fare.priceMinor));
  if (priced.length === 0) return null;
  return priced.reduce((cheapest, fare) =>
    fare.priceMinor < cheapest.priceMinor ? fare : cheapest,
  );
}

/**
 * Exact to the kuruş — rounding a ₺450,50 fare to ₺451 misstates what the ticket costs.
 *
 * Total by necessity, not by taste. `Intl.NumberFormat` throws on anything that isn't a
 * well-formed ISO 4217 code, and the currency reaching it is whatever TCDD put in
 * `minPriceCurrency` (the mapper passes any string through) or whatever a commitment's unchecked
 * JSON column holds. This now renders inside a server component, so one "TL" in one stored plan
 * would 500 the whole `/plans` page — against both the mapper's contract of dropping what it
 * can't read and CrewRest's rule that the timetable degrades rather than errors the page.
 */
export function formatFare(fare: TrainFare): string {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: fare.currency,
    }).format(fare.priceMinor / 100);
  } catch {
    const amount = (fare.priceMinor / 100).toFixed(2);
    return fare.currency ? `${amount} ${fare.currency}` : amount;
  }
}
