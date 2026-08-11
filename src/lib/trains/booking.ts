/**
 * Hands a chosen train off to TCDD's own booking site.
 *
 * CrewRest does not sell tickets. TCDD settles card payments through a bank 3-D Secure redirect
 * where the cardholder authenticates on the bank's page, so the last step necessarily happens on
 * TCDD's site — no provider capability changes that. What CrewRest can do is take the pilot there
 * with the trip already filled in.
 *
 * The catch: ebilet is a single-page app and publishes no documented deep-link format. Fetching
 * it server-side returns only the shell, so the parameters can't be discovered from here — they
 * have to be read off a real search in a browser. Rather than ship a guess that silently sends
 * the pilot to the wrong route, the default is the plain search page, and the parameterised form
 * is enabled by setting `TCDD_BOOKING_URL_TEMPLATE` once the format is confirmed:
 *
 *   TCDD_BOOKING_URL_TEMPLATE="https://ebilet.tcddtasimacilik.gov.tr/?from={from}&to={to}&date={date}"
 *
 * Placeholders: `{from}` `{to}` (TCDD station ids, URL-encoded), `{date}` (YYYY-MM-DD),
 * `{time}` (HH:MM, Türkiye local).
 */

import type { TrainOption } from "@/lib/trains/TrainProvider";
import { toTcddStation } from "@/lib/trains/data/tcddStations";
import { TURKEY_UTC_OFFSET_MINUTES, formatTurkeyTime } from "@/lib/time/turkeyTime";

export const EBILET_SEARCH_URL = "https://ebilet.tcddtasimacilik.gov.tr/";

/** Türkiye-local "YYYY-MM-DD" — the date the pilot actually travels, not the UTC one. */
function turkeyDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

/**
 * Where to send the pilot to buy this train. Falls back to the bare search page whenever the
 * link can't be built accurately — a correct page they must search on beats a prefilled one
 * pointing somewhere else.
 */
export function buildBookingUrl(
  option: Pick<TrainOption, "originCode" | "destinationCode" | "departureAt">,
  template: string | undefined = process.env.TCDD_BOOKING_URL_TEMPLATE,
): string {
  if (!template) return EBILET_SEARCH_URL;

  const from = toTcddStation(option.originCode);
  const to = toTcddStation(option.destinationCode);
  if (!from || !to) return EBILET_SEARCH_URL;

  const replacements: Record<string, string> = {
    "{from}": encodeURIComponent(from),
    "{to}": encodeURIComponent(to),
    "{date}": turkeyDateKey(option.departureAt),
    "{time}": formatTurkeyTime(option.departureAt),
  };

  const url = Object.entries(replacements).reduce(
    (acc, [placeholder, value]) => acc.split(placeholder).join(value),
    template,
  );

  // A malformed template shouldn't render a dead link in the UI.
  try {
    return new URL(url).toString();
  } catch {
    console.warn("[trains] TCDD_BOOKING_URL_TEMPLATE did not produce a valid URL.");
    return EBILET_SEARCH_URL;
  }
}
