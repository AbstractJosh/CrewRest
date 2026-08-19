/** Turkey has used a fixed UTC+3 offset (no DST) since 2016. */
export const TURKEY_UTC_OFFSET_MINUTES = 3 * 60;

/**
 * Builds a Date from Turkey-local wall-clock components, independent of the
 * server's local timezone.
 */
export function buildTurkeyDate(
  year: number,
  monthIndex0Based: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const utcMs =
    Date.UTC(year, monthIndex0Based, day, hour, minute, 0, 0) -
    TURKEY_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utcMs);
}

/** Formats a Date as Turkey-local "HH:MM", regardless of server timezone. */
export function formatTurkeyTime(date: Date): string {
  const turkeyMs = date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000;
  const shifted = new Date(turkeyMs);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const MONTH_ABBREVS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Formats a Date as Turkey-local "DD Mon" (e.g. "15 Aug"), for display. */
export function formatTurkeyDateLabel(date: Date): string {
  const turkeyMs = date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000;
  const shifted = new Date(turkeyMs);
  return `${String(shifted.getUTCDate()).padStart(2, "0")} ${MONTH_ABBREVS[shifted.getUTCMonth()]}`;
}

/** Formats a Date as Turkey-local "DD Mon HH:MM", for display. */
export function formatTurkeyDateTime(date: Date): string {
  return `${formatTurkeyDateLabel(date)} ${formatTurkeyTime(date)}`;
}

/** Formats a Date as GMT "HH:MM". */
export function formatUtcTime(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Formats a Date as GMT "DD Mon". */
export function formatUtcDateLabel(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTH_ABBREVS[date.getUTCMonth()]}`;
}

/** Formats a Date as GMT "DD Mon HH:MM". */
export function formatUtcDateTime(date: Date): string {
  return `${formatUtcDateLabel(date)} ${formatUtcTime(date)}`;
}

/**
 * Formats a span in Türkiye local time, e.g. "01 Aug 15:20 → 23:45".
 *
 * The end date is printed only when the span crosses local midnight, which keeps the common
 * same-day case short.
 */
export function formatTurkeyRange(start: Date, end: Date): string {
  const startLabel = formatTurkeyDateLabel(start);
  const endLabel = formatTurkeyDateLabel(end);
  const endPart =
    startLabel === endLabel
      ? formatTurkeyTime(end)
      : `${endLabel} ${formatTurkeyTime(end)}`;
  return `${startLabel} ${formatTurkeyTime(start)} → ${endPart}`;
}

/**
 * The same span in GMT, e.g. "12:20 → 20:45" — a secondary annotation under the local time.
 *
 * Dates are shown on both ends or neither: the GMT day can differ from the local one, so a
 * date on just the end ("21:00 → 03 Aug 20:59") would leave the start's day ambiguous.
 */
export function formatUtcRange(start: Date, end: Date): string {
  const startLabel = formatUtcDateLabel(start);
  const endLabel = formatUtcDateLabel(end);
  if (startLabel === endLabel) {
    return `${formatUtcTime(start)} → ${formatUtcTime(end)}`;
  }
  return `${startLabel} ${formatUtcTime(start)} → ${endLabel} ${formatUtcTime(end)}`;
}

/** Formats a duration in minutes as "Xh Ym" (or "Xh" when whole hours). */
export function formatDurationMinutes(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(totalMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${minutes}m`;
}

/**
 * Türkiye-local "YYYY-MM-DD" — the calendar day the pilot actually travels, not the UTC one.
 *
 * The machine-readable half of a Türkiye day: it is what the ebilet link's `gidisTarih` carries
 * and what the timetable cache is keyed by. Shifts into UTC first for the reason `turkeyMidnight`
 * spells out below.
 */
export function turkeyDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

/**
 * The human-readable half of the same day, e.g. "Sat 22 Aug" for "2026-08-22".
 *
 * Takes the key rather than the instant on purpose. It exists to label a link whose date
 * parameter *is* that key, and deriving "which Türkiye day is this" twice — once for the URL,
 * once for the caption beside it — is two chances to disagree about a 00:40 departure.
 *
 * The key is already Türkiye-local, so there is nothing left to shift: it is read back through
 * `Date.UTC` purely to get the weekday, which no arithmetic on the string can give.
 */
export function formatTurkeyDateKeyLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${DAY_ABBREVS[weekday]} ${String(day).padStart(2, "0")} ${MONTH_ABBREVS[month - 1]}`;
}

/**
 * Midnight Türkiye-local, as a UTC instant, for the day the given instant falls on.
 *
 * Shifts into UTC first rather than reading local components — the server's zone is not Istanbul,
 * so `getFullYear()` and friends would silently derive the wrong day.
 */
export function turkeyMidnight(date: Date): Date {
  const shifted = new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
  const midnightShiftedMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightShiftedMs - TURKEY_UTC_OFFSET_MINUTES * 60_000);
}
