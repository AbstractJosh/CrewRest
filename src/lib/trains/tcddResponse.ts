/**
 * Turns whatever TCDD's API returns into `TrainOption`s.
 *
 * Kept separate from the HTTP client, and pure, so it can be tested against a saved fixture with
 * no network. It is also the one file to edit when the real response shape turns out to differ
 * from what's assumed here — TCDD publishes no API contract, so the accessors below deliberately
 * accept several plausible spellings of each field rather than committing to one.
 */

import { buildTurkeyDate, TURKEY_UTC_OFFSET_MINUTES } from "@/lib/time/turkeyTime";
import type { TrainFare, TrainOption } from "@/lib/trains/TrainProvider";

const DAY_MS = 24 * 60 * 60_000;

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** First present, non-null value among the given keys. */
function pick(source: Json, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function pickString(source: Json, keys: readonly string[]): string | undefined {
  const value = pick(source, keys);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function pickNumber(source: Json, keys: readonly string[]): number | undefined {
  const value = pick(source, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // Turkish formatting uses "." for thousands and "," for decimals ("1.250,50").
    const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && normalized !== "") return parsed;
  }
  return undefined;
}

/** The array of trains, wherever the payload happens to keep it. */
function findTrainArray(payload: unknown): Json[] {
  if (Array.isArray(payload)) return payload.filter(isJson);
  if (!isJson(payload)) return [];

  const candidates = ["trains", "trainLegs", "trainList", "results", "data", "items"];
  for (const key of candidates) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isJson);
    // Some wrappers nest one level: { data: { trains: [...] } }
    if (isJson(value)) {
      const nested = findTrainArray(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
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

const CLASS_NAME_KEYS = ["className", "name", "cabinClass", "kabinAdi", "type"] as const;
const PRICE_KEYS = ["price", "priceAmount", "fiyat", "amount", "totalPrice"] as const;
const SEAT_KEYS = ["availableSeats", "emptyPlaceCount", "availability", "bosYerSayisi"] as const;

function mapFares(item: Json): TrainFare[] | undefined {
  const raw = pick(item, ["fares", "cabins", "classes", "priceList", "vagonTipleri"]);
  if (!Array.isArray(raw)) return undefined;

  const fares = raw.filter(isJson).flatMap((entry): TrainFare[] => {
    const price = pickNumber(entry, PRICE_KEYS);
    if (price === undefined) return [];
    return [
      {
        className: pickString(entry, CLASS_NAME_KEYS) ?? "Standart",
        // Prices come through as major-unit TRY ("450,50"); stored as kuruş to stay integral.
        priceMinor: Math.round(price * 100),
        currency: pickString(entry, ["currency", "currencyCode", "paraBirimi"]) ?? "TRY",
        availableSeats: pickNumber(entry, SEAT_KEYS),
      },
    ];
  });

  return fares.length > 0 ? fares : undefined;
}

export interface MapTcddOptions {
  originCode: string;
  destinationCode: string;
  /** The day that was queried — supplies the date when the payload only carries "HH:MM". */
  date: Date;
}

/**
 * Maps a raw TCDD payload to `TrainOption`s, dropping any entry it can't read a departure and
 * arrival from. A partial timetable beats an exception: one malformed row shouldn't cost the
 * pilot the whole day's trains.
 */
export function mapTcddResponse(payload: unknown, options: MapTcddOptions): TrainOption[] {
  const { originCode, destinationCode, date } = options;

  return findTrainArray(payload)
    .flatMap((item, index): TrainOption[] => {
      const departureAt = parseTcddInstant(
        pick(item, ["departureTime", "departureAt", "binisTarihi", "departure", "kalkis"]),
        date,
      );
      const arrivalRaw = parseTcddInstant(
        pick(item, ["arrivalTime", "arrivalAt", "inisTarihi", "arrival", "varis"]),
        date,
      );
      if (!departureAt || !arrivalRaw) return [];

      // An overnight service arrives "before" it departs once the date is only implied by a
      // bare "HH:MM"; roll it to the next day.
      const arrivalAt =
        arrivalRaw.getTime() < departureAt.getTime()
          ? new Date(arrivalRaw.getTime() + DAY_MS)
          : arrivalRaw;

      const fares = mapFares(item);
      const availableSeats =
        pickNumber(item, SEAT_KEYS) ??
        fares?.reduce(
          (total, fare) => (fare.availableSeats === undefined ? total : total + fare.availableSeats),
          0,
        );

      const soldOutFlag = pick(item, ["isSoldOut", "soldOut", "dolu"]);

      return [
        {
          trainNumber:
            pickString(item, ["trainNumber", "trainName", "trenAdi", "number", "name"]) ??
            `TCDD${String(index + 1).padStart(2, "0")}`,
          originCode,
          destinationCode,
          departureAt,
          arrivalAt,
          durationMinutes: Math.round(
            (arrivalAt.getTime() - departureAt.getTime()) / 60_000,
          ),
          source: "live",
          providerTrainId: pickString(item, ["id", "trainId", "seferId", "journeyId"]),
          fares,
          availableSeats,
          isSoldOut:
            typeof soldOutFlag === "boolean"
              ? soldOutFlag
              : availableSeats !== undefined
                ? availableSeats <= 0
                : undefined,
        },
      ];
    })
    .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
}
