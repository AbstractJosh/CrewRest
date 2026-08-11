/**
 * Turns TCDD's availability response into `TrainOption`s.
 *
 * Kept separate from the HTTP client, and pure, so it can be tested against a saved fixture with
 * no network. The payload shape (`trainLegs` → `trainAvailabilities` → `trains`) is now known and
 * verified against real captured responses in `__fixtures__` — see those fixtures and their
 * README for what TCDD actually sends.
 */

import { buildTurkeyDate, TURKEY_UTC_OFFSET_MINUTES } from "@/lib/time/turkeyTime";
import type { TrainFare, TrainOption } from "@/lib/trains/TrainProvider";

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;
const TIME_ONLY = /^(\d{1,2}):(\d{2})/;

/**
 * Parses a TCDD timestamp into a real instant.
 *
 * This is the trap the whole integration turns on. TCDD reports Türkiye wall-clock time, usually
 * with no zone designator. Handing `"2026-08-15T07:30:00"` to `new Date()` makes V8 read it in
 * the *server's* zone, so every train silently shifts by however far the host is from UTC+3 —
 * correct on a machine in Istanbul, wrong everywhere else, and wrong in a way that still produces
 * plausible-looking times. So a naive string is rebuilt through `buildTurkeyDate`, and only a
 * string that explicitly carries a zone is trusted to `Date`.
 *
 * `referenceDate` supplies the calendar day when the payload gives a bare "HH:MM".
 */
export function parseTcddInstant(value: unknown, referenceDate: Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    // Epoch, in seconds or milliseconds depending on magnitude.
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms);
  }
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (raw === "") return null;

  if (ISO_WITH_ZONE.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const naive = NAIVE_DATE_TIME.exec(raw);
  if (naive) {
    const [, year, month, day, hour, minute] = naive;
    return buildTurkeyDate(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );
  }

  const timeOnly = TIME_ONLY.exec(raw);
  if (timeOnly) {
    const shifted = new Date(referenceDate.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
    return buildTurkeyDate(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      Number(timeOnly[1]),
      Number(timeOnly[2]),
    );
  }

  return null;
}

/**
 * Cabin classes a pilot cannot book.
 *
 * A denylist, not an allowlist: TCDD returns five cabin classes today (Y1 EKONOMİ, C BUSİNESS,
 * L LOCA, B YATAKLI, DSB TEKERLEKLİ SANDALYE) and may add more. An allowlist would silently drop
 * a new one — including, on the day it was written, the sleeper berth on the overnight service,
 * which is one of the better commutes on the route.
 *
 * This matters more than it looks: on a typical day most trains have sold out of everything
 * except DSB, so counting wheelchair spaces as availability would route the pilot onto a train
 * they cannot board.
 */
export const EXCLUDED_CABIN_CODES: readonly string[] = ["DSB"];

/** Every train in the payload, flattened out of the leg/availability nesting. */
function collectTrains(payload: unknown): Json[] {
  if (!isJson(payload)) return [];
  const legs = payload.trainLegs;
  if (!Array.isArray(legs)) return [];

  return legs.filter(isJson).flatMap((leg) => {
    const availabilities = leg.trainAvailabilities;
    if (!Array.isArray(availabilities)) return [];
    return availabilities.filter(isJson).flatMap((availability) => {
      const trains = availability.trains;
      return Array.isArray(trains) ? trains.filter(isJson) : [];
    });
  });
}

/** The cabin-class code on an entry that nests one, upper-cased. */
function cabinCodeOf(entry: Json): string | null {
  const cabin = entry.cabinClass;
  if (!isJson(cabin)) return null;
  const code = cabin.code;
  return typeof code === "string" && code !== "" ? code.toUpperCase() : null;
}

function cabinNameOf(entry: Json): string | undefined {
  const cabin = entry.cabinClass;
  if (!isJson(cabin)) return undefined;
  return typeof cabin.name === "string" && cabin.name !== "" ? cabin.name : undefined;
}

/**
 * One fare per cabin class, cheapest wins.
 *
 * Fares are nested under fare families (`STANDART`, and others TCDD may add), so the same cabin
 * can appear more than once at different prices. The pilot cares what the class costs, not which
 * family it came from.
 */
function mapFares(train: Json): TrainFare[] | undefined {
  const families = train.availableFareInfo;
  if (!Array.isArray(families)) return undefined;

  const byCode = new Map<string, TrainFare>();

  for (const family of families.filter(isJson)) {
    const classes = family.cabinClasses;
    if (!Array.isArray(classes)) continue;

    for (const entry of classes.filter(isJson)) {
      const code = cabinCodeOf(entry);
      const price = entry.minPrice;
      if (!code || typeof price !== "number" || !Number.isFinite(price)) continue;

      const fare: TrainFare = {
        code,
        className: cabinNameOf(entry) ?? code,
        // TCDD quotes major-unit TRY; stored as kuruş to stay integral.
        priceMinor: Math.round(price * 100),
        currency:
          typeof entry.minPriceCurrency === "string" ? entry.minPriceCurrency : "TRY",
        availableSeats:
          typeof entry.availabilityCount === "number" ? entry.availabilityCount : undefined,
      };

      const existing = byCode.get(code);
      if (!existing || fare.priceMinor < existing.priceMinor) byCode.set(code, fare);
    }
  }

  return byCode.size > 0 ? [...byCode.values()] : undefined;
}

/** Seats the pilot could actually buy, or undefined when TCDD reported no availability block. */
function bookableSeats(train: Json): number | undefined {
  const availabilities = train.cabinClassAvailabilities;
  if (!Array.isArray(availabilities)) return undefined;

  let total = 0;
  for (const entry of availabilities.filter(isJson)) {
    const code = cabinCodeOf(entry);
    if (code && EXCLUDED_CABIN_CODES.includes(code)) continue;
    const count = entry.availabilityCount;
    if (typeof count === "number" && Number.isFinite(count)) total += count;
  }
  return total;
}

export interface MapTcddOptions {
  originCode: string;
  destinationCode: string;
  /** The day that was queried — supplies the date when a timestamp only carries "HH:MM". */
  date: Date;
}

/**
 * Maps a TCDD availability payload to `TrainOption`s, dropping any train it can't read a
 * departure and arrival from. A partial timetable beats an exception: one malformed row
 * shouldn't cost the pilot the whole day's trains.
 */
export function mapTcddResponse(payload: unknown, options: MapTcddOptions): TrainOption[] {
  const { originCode, destinationCode, date } = options;

  return collectTrains(payload)
    .flatMap((train, index): TrainOption[] => {
      const segments = Array.isArray(train.segments) ? train.segments.filter(isJson) : [];
      if (segments.length === 0) return [];

      // A train carries every segment of its whole run, so arrival at *our* destination is the
      // last one's. `segments[0].arrivalTime` is the first intermediate stop, minutes away.
      const departureAt = parseTcddInstant(segments[0].departureTime, date);
      const arrivalAt = parseTcddInstant(segments[segments.length - 1].arrivalTime, date);
      if (!departureAt || !arrivalAt) return [];

      const fares = mapFares(train);
      const availableSeats = bookableSeats(train);
      const trainNumber =
        typeof train.number === "string" && train.number !== ""
          ? train.number
          : typeof train.commercialName === "string" && train.commercialName !== ""
            ? train.commercialName
            : `TCDD${String(index + 1).padStart(2, "0")}`;

      return [
        {
          trainNumber,
          originCode,
          destinationCode,
          departureAt,
          arrivalAt,
          durationMinutes: Math.round(
            (arrivalAt.getTime() - departureAt.getTime()) / 60_000,
          ),
          source: "live",
          providerTrainId: train.id === undefined || train.id === null ? undefined : String(train.id),
          fares,
          availableSeats,
          // `onSale: false` means TCDD isn't selling this train at all, whatever the counts say.
          isSoldOut:
            train.onSale === false
              ? true
              : availableSeats === undefined
                ? undefined
                : availableSeats <= 0,
        },
      ];
    })
    .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
}
