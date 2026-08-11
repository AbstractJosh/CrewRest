/**
 * Hands a chosen train off to TCDD's own booking site.
 *
 * CrewRest does not sell tickets. TCDD settles card payments through a bank 3-D Secure redirect
 * where the cardholder authenticates on the bank's page, so the last step necessarily happens on
 * TCDD's site — no provider capability changes that. What CrewRest can do is take the pilot there
 * with the trip already filled in.
 *
 * The deep-link format is undocumented but not undiscoverable: see `EBILET_DEFAULT_TEMPLATE`
 * below for where it was read from. `TCDD_BOOKING_URL_TEMPLATE` overrides it, for if TCDD changes
 * the format:
 *
 *   TCDD_BOOKING_URL_TEMPLATE="https://ebilet.tcddtasimacilik.gov.tr/?from={from}&to={to}&date={date}"
 *
 * Placeholders: `{fromId}` `{toId}` (numeric TCDD station ids), `{from}` `{to}` (station names,
 * URL-encoded), `{date}` (YYYY-MM-DD), `{time}` (HH:MM, Türkiye local).
 */

import type { TrainOption } from "@/lib/trains/TrainProvider";
import { toTcddStation } from "@/lib/trains/data/tcddStations";
import { TURKEY_UTC_OFFSET_MINUTES, formatTurkeyTime } from "@/lib/time/turkeyTime";

export const EBILET_SEARCH_URL = "https://ebilet.tcddtasimacilik.gov.tr/";

/**
 * The trip prefilled on ebilet's own redirect route.
 *
 * These parameter names are not documented; they were read off the `SeferListRedirect` component
 * in ebilet's lazily-loaded `4696.*.chunk.js`, which parses exactly six query variables and pushes
 * the resulting search into the app's store. A scan of the initial bundle misses this file
 * entirely, which is why the format was long assumed undiscoverable.
 *
 * `seyahatTuru=1` is one-way; `0` means round trip and additionally reads `donusTarih`.
 */
export const EBILET_DEFAULT_TEMPLATE =
  "https://ebilet.tcddtasimacilik.gov.tr/sefer-listesi-yonlendirme" +
  "?binisIstasyonId={fromId}&inisIstasyonId={toId}&gidisTarih={date}" +
  "&yolcuSayisi=1&seyahatTuru=1";

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
  template: string | undefined = process.env.TCDD_BOOKING_URL_TEMPLATE ||
    EBILET_DEFAULT_TEMPLATE,
): string {
  if (!template) return EBILET_SEARCH_URL;

  const from = toTcddStation(option.originCode);
  const to = toTcddStation(option.destinationCode);
  if (!from || !to) return EBILET_SEARCH_URL;

  const replacements: Record<string, string> = {
    "{fromId}": String(from.id),
    "{toId}": String(to.id),
    "{from}": encodeURIComponent(from.name),
    "{to}": encodeURIComponent(to.name),
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
