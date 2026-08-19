"use client";

/**
 * The roster drawn as a month calendar, following the handoff in `design/calendar design/`.
 *
 * The bars carry no times. A month of them printed a range each and the result was unreadable, so
 * the times moved behind a click: every bar is a button, and the one selected spells itself out in
 * the panel under the grid. Still read-only — no editing, no month navigation.
 *
 * That click is the only reason this file is a client component, and it is the first on this page,
 * so the boundary is drawn as tightly as it can usefully be: the page stays a server component,
 * `MonthGrid` crosses it unchanged (it is strings, numbers and booleans all the way down — the
 * `Date`s are spent inside `buildMonthGrid`), and the only state is which bar's key is selected.
 * Nothing is fetched, nothing is measured, no effect runs.
 *
 * Measurement in particular stays out: every metric is a CSS variable (see `globals.css`), so the
 * design's two size steps are a media query rather than a resize listener, and the overlay's offset
 * is arithmetic `calc()` does without this component knowing which step is in force.
 */

import { useState } from "react";
import type {
  CalendarEventType,
  CalendarSegment,
  CalendarWeek,
  MonthGrid,
} from "@/lib/calendar/monthGrid";
import { FOCUS_RING } from "@/components/ui/focusRing";

/** Monday first, as the design specifies. */
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The bar colour per event type, as tokens so dark mode can restate them in one place. */
const TYPE_COLOR: Record<CalendarEventType, string> = {
  duty: "var(--cal-duty)",
  standby: "var(--cal-standby)",
  transit: "var(--cal-transit)",
  train: "var(--cal-train)",
};

const LEGEND: { type: CalendarEventType; label: string }[] = [
  { type: "duty", label: "Flight duty" },
  { type: "standby", label: "Home standby" },
  { type: "transit", label: "Transit" },
  { type: "train", label: "Train ride" },
];

/**
 * How a bar the pilot has not committed to is drawn: its own colour, faded.
 *
 * A fifth hue would read as a fifth kind of event, and the four are the legend. Fading is a
 * separate channel, so it composes with all of them — and it survives the widths this grid deals
 * in, where a dashed edge on a three-pixel bar would show a single dash and say nothing.
 */
const TENTATIVE_MIX = 45;

function barColor(type: CalendarEventType, isTentative: boolean): string {
  const color = TYPE_COLOR[type];
  return isTentative ? `color-mix(in oklab, ${color} ${TENTATIVE_MIX}%, transparent)` : color;
}

function findSegment(months: MonthGrid[], key: string | null): CalendarSegment | null {
  if (key === null) return null;
  for (const month of months) {
    for (const week of month.weeks) {
      for (const segment of week.segments) {
        if (segment.key === key) return segment;
      }
    }
  }
  // A refreshed roster can retire the key the pilot last clicked; falling back to nothing selected
  // is better than holding a stale bar's times open.
  return null;
}

function EventBar({
  segment,
  isSelected,
  onSelect,
}: {
  segment: CalendarSegment;
  isSelected: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <button
      type="button"
      title={segment.tooltip}
      aria-pressed={isSelected}
      /*
       * The visible label is dropped on a narrow bar and hidden outright on a narrow viewport, so
       * the accessible name cannot be the bar's own text. It says what the panel would say.
       */
      aria-label={[segment.title, segment.dayLabel, segment.localRange, segment.note]
        .filter(Boolean)
        .join(", ")}
      onClick={() => onSelect(segment.key)}
      style={{
        position: "absolute",
        left: `${segment.leftPercent.toFixed(2)}%`,
        width: `${segment.widthPercent.toFixed(2)}%`,
        top: 0,
        /*
         * The button is a hit target, not the bar. At the narrow size step the bar itself is eight
         * pixels tall and a transit leg a few pixels wide, and tapping it is the only way to read
         * its times — there is no hover tooltip on a touch screen. So the box that takes the tap
         * is held at a finger's height while the ink below stays exactly where the design put it.
         * The width is the honest one: widening it would overlap the neighbouring bar's target in
         * a ribbon that has no gaps in it, and a tap landing on the wrong leg is worse than a
         * fiddly one.
         */
        height: "var(--cal-hit-h)",
      }}
      className={`pointer-events-auto cursor-pointer text-left outline-none ${FOCUS_RING}`}
    >
      <span
        style={{
          height: "var(--cal-block-h)",
          // No fill, no border, no radius — the underline is the whole visual identity of a bar.
          // Selection doubles it rather than recolouring it: the four hues are the type legend, and
          // a fifth would say "another kind of event" instead of "this one".
          borderBottomStyle: "solid",
          borderBottomColor: barColor(segment.type, segment.isTentative),
          borderBottomWidth: isSelected ? "calc(var(--cal-bar) * 2)" : "var(--cal-bar)",
        }}
        className={`absolute inset-x-0 top-0 flex items-center overflow-hidden px-[0.15rem] leading-[1.1] max-[700px]:px-0 ${
          isSelected ? "bg-sunken" : ""
        }`}
      >
        <span
          className={`hidden shrink-0 whitespace-nowrap text-[0.7rem] font-medium leading-[1.35] min-[701px]:block ${
            segment.isHead ? "text-ink" : "italic text-cal-label"
          }`}
        >
          {segment.label}
        </span>
      </span>
    </button>
  );
}

function WeekRow({
  week,
  selectedKey,
  onSelect,
}: {
  week: CalendarWeek;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="relative">
      <div className="grid grid-cols-7">
        {week.days.map((day) => (
          <div
            key={day.dateKey}
            style={{ height: "var(--cal-cell-h)" }}
            className={`flex flex-col items-start justify-start border-b border-cal-rule px-[0.15rem] py-[0.35rem] max-[700px]:px-[0.1rem] max-[700px]:py-[0.3rem] ${
              day.inMonth ? "" : "opacity-35"
            }`}
          >
            <span
              className={`block font-mono text-[0.75rem] font-medium leading-[1.1] tabular-nums max-[700px]:text-[0.7rem] ${
                day.inMonth ? "text-ink" : "text-ink-faint"
              }`}
            >
              {day.dayOfMonth}
            </span>
          </div>
        ))}
      </div>

      {/*
        The bars live in an overlay rather than in the cells, because an event spans days and a
        cell cannot. One row of them, so the overlay's box is a constant and lives in the
        stylesheet with the rest of the calendar's metrics.
      */}
      <div className="roster-calendar-overlay pointer-events-none">
        {week.segments.map((segment) => (
          <EventBar
            key={segment.key}
            segment={segment}
            isSelected={segment.key === selectedKey}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * What the selected bar actually says, under the grid rather than floating over it: a popover on a
 * bar a few pixels wide would be pinned to nothing, and the grid clips.
 *
 * It keeps its height when nothing is selected. Collapsing would move everything below it on every
 * click, which on a page whose point is scanning a month is worse than a line of grey text.
 */
function DetailPanel({ segment }: { segment: CalendarSegment | null }) {
  return (
    <div
      aria-live="polite"
      /* Tall enough for the three lines a selection prints, so choosing one moves nothing. */
      className="min-h-[5.5rem] rounded-lg border border-rule bg-sunken px-4 py-3"
    >
      {segment === null ? (
        <p className="text-xs text-ink-faint">Select a bar to read its times.</p>
      ) : (
        <>
          <p className="text-sm font-medium text-ink">
            {segment.title}
            {segment.note && (
              <span className="ml-2 text-xs font-normal text-ink-faint">{segment.note}</span>
            )}
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-ink-muted">
            {segment.dayLabel} · {segment.localRange}
          </p>
          <p className="font-mono text-xs tabular-nums text-ink-faint">{segment.utcRange} GMT</p>
        </>
      )}
    </div>
  );
}

export default function RosterCalendar({ months }: { months: MonthGrid[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = findSegment(months, selectedKey);
  const hasTentative = months.some((month) =>
    month.weeks.some((week) => week.segments.some((segment) => segment.isTentative)),
  );

  // Clicking the selected bar again puts the times away, so the panel is never stuck open on a
  // trip the pilot has finished reading.
  const select = (key: string) => setSelectedKey((current) => (current === key ? null : key));

  return (
    <div className="roster-calendar flex flex-col gap-5">
      {months.map((month) => (
        <div key={`${month.year}-${month.month}`}>
          {/*
            A roster is a month, so there is normally one grid and the page header already names
            the period. A roster that crosses a boundary gets both months, and then each one has
            to say which it is.
          */}
          {months.length > 1 && (
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.1em] text-ink-faint">
              {MONTH_NAMES[month.month]} {month.year}
            </p>
          )}

          <div className="border-t border-rule">
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  className="pb-[0.6rem] pt-2 font-mono text-[0.6rem] font-medium uppercase tracking-[0.14em] text-cal-label"
                >
                  {weekday}
                </div>
              ))}
            </div>

            {month.weeks.map((week, index) => (
              <WeekRow
                key={`${month.year}-${month.month}-${index}`}
                week={week}
                selectedKey={selectedKey}
                onSelect={select}
              />
            ))}
          </div>
        </div>
      ))}

      <DetailPanel segment={selected} />

      <div className="flex flex-wrap items-center gap-5 px-[0.15rem] py-1">
        {LEGEND.map((item) => (
          <span key={item.type} className="inline-flex items-center gap-2 text-xs text-ink-faint">
            <span
              style={{ background: TYPE_COLOR[item.type] }}
              className="h-[6px] w-5"
              aria-hidden
            />
            {item.label}
          </span>
        ))}

        {/* Only when there is one on the grid — a key to a treatment nothing uses is noise. */}
        {hasTentative && (
          <span className="inline-flex items-center gap-2 text-xs text-ink-faint">
            <span
              style={{ background: barColor("train", true) }}
              className="h-[6px] w-5"
              aria-hidden
            />
            Faded: suggested, not committed
          </span>
        )}
      </div>
    </div>
  );
}
