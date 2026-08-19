/**
 * The month grid behind the roster calendar: which days sit in which week, and where each event's
 * bar lies across them.
 *
 * All of it is arithmetic on Türkiye-local days, so it lives here rather than in the component —
 * the percentage geometry is exactly the part worth testing without a browser, and the page that
 * draws it stays a dumb renderer.
 *
 * The design handoff in `design/calendar design/` is the authority on the look, and this departs
 * from its geometry in one deliberate way. The prototype's events are whole days carrying a
 * per-type time constant, so it could afford to centre each bar inside its own day span and to
 * stack overlapping bars into lanes. A real roster's events are instants that *abut*: the duty is
 * released and the transit to the station begins on that same minute. Centring opened a gap
 * between the two where there is none, and lanes drew the pair as two rows rather than as one line
 * changing colour. So bars sit at their true times in a single row, and where the arithmetic would
 * overlap them they are pushed apart into one continuous ribbon instead.
 */

import {
  formatTurkeyDateKeyLabel,
  formatTurkeyTime,
  formatUtcRange,
  turkeyDateKey,
  turkeyMidnight,
} from "@/lib/time/turkeyTime";

export type CalendarEventType = "duty" | "standby" | "transit" | "train";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  /** What the bar says when there is room, e.g. "Flight duty". */
  label: string;
  /** What it says when there is not, e.g. "Duty". */
  shortLabel: string;
  /**
   * Anything the detail panel should carry beyond the label and the times — the count of duties
   * behind a merged bar, or that a trip is only a suggestion. Off the bar because the bar is too
   * small to hold it, and because the merge is a display decision the pilot is entitled to see
   * through.
   */
  detail?: string;
  /**
   * True for something the pilot has not committed to. The bar is drawn in a faded version of its
   * own colour rather than a fifth hue — a speculative trip has to be tellable from a booked one
   * while the grid is being scanned, which is the reading mode this page exists for, and the
   * caveat in `detail` is a click away.
   */
  isTentative?: boolean;
  startAt: Date;
  endAt: Date;
}

export interface CalendarDay {
  /** Türkiye-local "YYYY-MM-DD" — the cell's identity, not a display string. */
  dateKey: string;
  dayOfMonth: number;
  /** False for the days borrowed from the neighbouring months to fill the first and last weeks. */
  inMonth: boolean;
}

export interface CalendarSegment {
  key: string;
  type: CalendarEventType;
  /**
   * What the bar itself prints: the full label, the short one, "continues" on the far side of a
   * week boundary, or nothing at all when the bar is too narrow to hold a word.
   */
  label: string;
  tooltip: string;
  /** True when this segment carries the event's real start, false when the week cut it. */
  isHead: boolean;
  /** Percentages of the week's width, so the bar needs no measurement to be placed. */
  leftPercent: number;
  widthPercent: number;

  /*
   * What the detail panel reads when the bar is clicked. Structured rather than left for the
   * component to cut back out of `tooltip`: a panel that split a display string apart would have
   * to keep agreeing with how that string is built, and the times are the whole reason the panel
   * exists. They describe the *event*, not this segment of it, so both halves of a split event
   * answer the same question the same way.
   */

  /** The event's full label, never shortened and never "continues". */
  title: string;
  /** The Türkiye-local day, or "Sat 08 Aug → Tue 11 Aug" when it runs over more than one. */
  dayLabel: string;
  /** Türkiye-local "06:40 → 15:05". */
  localRange: string;
  /** The same span in GMT, with dates when the GMT day differs at either end. */
  utcRange: string;
  /** `CalendarEvent.detail`, when there is one. */
  note?: string;
  /** `CalendarEvent.isTentative`, resolved — the bar is drawn faded when true. */
  isTentative: boolean;
}

export interface CalendarWeek {
  days: CalendarDay[];
  segments: CalendarSegment[];
}

export interface MonthGrid {
  year: number;
  /** 0-based, as `Date` counts them. */
  month: number;
  weeks: CalendarWeek[];
}

const DAY_MS = 86_400_000;
const COLUMN_PERCENT = 100 / 7;

/**
 * The narrowest a bar may be drawn, as a percentage of the week — roughly eight pixels at the
 * page's own width, thin but unmistakably a colour rather than a hairline.
 *
 * It used to be a tenth of a week, because a bar had to be wide enough to hold its own label *and*
 * a time range. It carries neither now: the times moved into the detail panel, and a label is
 * printed only when the bar happens to be wide enough for one. So the floor is back to meaning
 * what it says — the point below which a colour stops being visible — and it has to be this small
 * for the bars to stand at their true times at all. A 90-minute transit is 0.89% of a week; a
 * tenth-of-a-week floor would swell it to a day and a half and shove the train that follows it
 * clean off its own departure time.
 */
const MIN_WIDTH_PERCENT = 0.7;

/** Wide enough for "Home standby"; below it the bar drops to "Standby". */
const FULL_LABEL_WIDTH_PERCENT = 7;

/** Wide enough for "Standby"; below it the bar is bare colour and says nothing at all. */
const SHORT_LABEL_WIDTH_PERCENT = 3.5;

/** What the far side of a week boundary prints instead of the event's own label. */
const CONTINUATION_LABEL = "continues";

/** How far through its Türkiye day an instant falls, as 0–1. */
function turkeyDayFraction(at: Date): number {
  return (at.getTime() - turkeyMidnight(at).getTime()) / DAY_MS;
}

/** Calendar arithmetic on a "YYYY-MM-DD" key, in UTC so no local zone can shift the day. */
function keyToUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function utcToKey(at: Date): string {
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const day = String(at.getUTCDate()).padStart(2, "0");
  return `${at.getUTCFullYear()}-${month}-${day}`;
}

/** Whole days from one key to another, inclusive of both — 1 for a single-day span. */
function daySpan(fromKey: string, toKey: string): number {
  return Math.round((keyToUtc(toKey).getTime() - keyToUtc(fromKey).getTime()) / DAY_MS) + 1;
}

interface PlacedEvent {
  event: CalendarEvent;
  startKey: string;
  endKey: string;
  startFraction: number;
  endFraction: number;
}

/**
 * An event as days and fractions of days.
 *
 * A duty released at exactly midnight ends on the day before, not as a zero-width sliver on the
 * next one: the pilot was not on duty for any part of that day, and a bar there would be widened
 * to the minimum and read as a real event.
 */
function place(event: CalendarEvent): PlacedEvent {
  const startKey = turkeyDateKey(event.startAt);
  let endKey = turkeyDateKey(event.endAt);
  let endFraction = turkeyDayFraction(event.endAt);

  if (endFraction === 0 && endKey > startKey) {
    endKey = utcToKey(new Date(keyToUtc(endKey).getTime() - DAY_MS));
    endFraction = 1;
  }

  return {
    event,
    startKey,
    endKey,
    startFraction: turkeyDayFraction(event.startAt),
    endFraction,
  };
}

/** "06:40 → 15:05" — times only; the dates are `dayLabel`'s job. */
function timeRange(event: CalendarEvent): string {
  return `${formatTurkeyTime(event.startAt)} → ${formatTurkeyTime(event.endAt)}`;
}

/** "Wed 05 Aug", or both ends when the event runs over more than one Türkiye day. */
function dayLabel(placed: PlacedEvent): string {
  const start = formatTurkeyDateKeyLabel(placed.startKey);
  const end = formatTurkeyDateKeyLabel(placed.endKey);
  return start === end ? start : `${start} → ${end}`;
}

/**
 * The whole record, for the native tooltip. ISO instants as well as the local range: a bar's width
 * is approximate by design, so this and the detail panel are where the underlying value is read.
 */
function tooltip(event: CalendarEvent): string {
  const detail = event.detail ? ` · ${event.detail}` : "";
  return (
    `${event.label}${detail} · ${event.startAt.toISOString()} → ${event.endAt.toISOString()}` +
    ` · ${timeRange(event)}`
  );
}

/**
 * Builds the grid for one Türkiye-local month, Monday first.
 *
 * Weeks always hold seven days, so the first and last borrow from the neighbouring months; those
 * cells are marked `inMonth: false` and drawn faded. Events are clipped to the week they are drawn
 * in, which is what splits a duty running Sunday into Monday into two segments.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  events: CalendarEvent[],
): MonthGrid {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  // getUTCDay() is Sunday-based; the design's week starts on Monday.
  const lead = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const gridStart = new Date(firstOfMonth.getTime() - lead * DAY_MS);
  const monthKeyPrefix = utcToKey(firstOfMonth).slice(0, 7);

  /*
   * By instant, not by day: the ribbon pass below walks this order and clamps each bar against the
   * one before it, so "before" has to mean the earlier minute. Sorting by day alone would leave a
   * 06:00 duty and an 18:00 one in whichever order they arrived in.
   */
  const placed = events
    .map(place)
    .sort(
      (a, b) =>
        a.event.startAt.getTime() - b.event.startAt.getTime() ||
        a.event.endAt.getTime() - b.event.endAt.getTime(),
    );

  const weeks: CalendarWeek[] = [];

  /*
   * Events whose head came out too thin to draw and was dropped. Weeks are built in order, so a
   * continuation reached after that is the first piece of its event the pilot can actually see —
   * and "continues" on it would point back at nothing.
   */
  const headless = new Set<string>();

  for (let weekIndex = 0; weekIndex * 7 < totalCells; weekIndex++) {
    const days: CalendarDay[] = [];
    for (let column = 0; column < 7; column++) {
      const at = new Date(gridStart.getTime() + (weekIndex * 7 + column) * DAY_MS);
      const dateKey = utcToKey(at);
      days.push({
        dateKey,
        dayOfMonth: at.getUTCDate(),
        inMonth: dateKey.startsWith(monthKeyPrefix),
      });
    }

    const weekStartKey = days[0].dateKey;
    const weekEndKey = days[6].dateKey;

    /*
     * The right edge of the bar drawn before this one, which is the only state the ribbon needs.
     * Bars are laid down in start order and none may begin before it, so the row is strictly
     * non-overlapping however the widening below lands.
     */
    let ribbonEnd = 0;
    const segments: CalendarSegment[] = [];

    for (const p of placed) {
      if (p.endKey < weekStartKey || p.startKey > weekEndKey) continue;

      const segmentStartKey = p.startKey > weekStartKey ? p.startKey : weekStartKey;
      const segmentEndKey = p.endKey < weekEndKey ? p.endKey : weekEndKey;
      const column = daySpan(weekStartKey, segmentStartKey);
      const span = daySpan(segmentStartKey, segmentEndKey);

      const carriesStart = p.startKey === segmentStartKey;
      const isTail = p.endKey === segmentEndKey;
      const startFraction = carriesStart ? p.startFraction : 0;
      const endFraction = isTail ? p.endFraction : 1;

      const trueLeft = (column - 1 + startFraction) * COLUMN_PERCENT;
      const trueRight = (column - 2 + span + endFraction) * COLUMN_PERCENT;

      /*
       * Where two bars would collide, the later one gives way: it starts where its predecessor
       * finished rather than at its own instant. Then the minimum width is applied by pushing the
       * bar's *end* out, never its start, which is what leaves a duty, the transit off the back of
       * it and the train after that reading as one line changing colour.
       *
       * A bar widened past its own end therefore nudges whatever comes next along with it — by at
       * most `MIN_WIDTH_PERCENT`, a bit over an hour of the week and two or three pixels at the
       * page's own width. That cost is real and it does land on the following bar's start, a
       * duty's report time included; it buys the alternative being a leg of the trip too thin to
       * see at all. It does not accumulate: a bar already wide enough keeps its own true end, so
       * the first one of those swallows the drift.
       *
       * All of which assumes events that abut or overlap in sequence, never one nested wholly
       * inside another — a nested bar has nowhere to be pushed to and would be shunted clean past
       * its container, onto the wrong day. `mergeAdjacent` in `rosterCalendarView.ts` is what
       * keeps that from arising; the drop below is the backstop if it ever does.
       */
      const left = Math.max(trueLeft, ribbonEnd);
      const right = Math.min(Math.max(trueRight, left + MIN_WIDTH_PERCENT), 100);
      const width = Math.max(right - left, 0);
      ribbonEnd = right;

      // A bar with no width is not a quiet bar, it is an invisible button sitting in the tab order
      // with a full accessible name. Better absent.
      if (width <= 0) {
        if (carriesStart) headless.add(p.event.id);
        continue;
      }

      const isHead = carriesStart || headless.delete(p.event.id);
      const fullLabel = isHead ? p.event.label : CONTINUATION_LABEL;
      const shortLabel = isHead ? p.event.shortLabel : CONTINUATION_LABEL;

      segments.push({
        /*
         * The month is part of the key because a roster crossing a month end draws two grids that
         * share a whole week, and the component matches the selected bar by key across all of
         * them. Without it, clicking 31 August in the September grid selects the August copy too.
         */
        key: `${year}-${month}:${p.event.id}:${segmentStartKey}`,
        type: p.event.type,
        label:
          width >= FULL_LABEL_WIDTH_PERCENT
            ? fullLabel
            : width >= SHORT_LABEL_WIDTH_PERCENT
              ? shortLabel
              : "",
        tooltip: tooltip(p.event),
        isHead,
        leftPercent: left,
        widthPercent: width,
        title: p.event.label,
        dayLabel: dayLabel(p),
        localRange: timeRange(p.event),
        utcRange: formatUtcRange(p.event.startAt, p.event.endAt),
        note: p.event.detail,
        isTentative: p.event.isTentative === true,
      });
    }

    weeks.push({ days, segments });
  }

  return { year, month, weeks };
}
