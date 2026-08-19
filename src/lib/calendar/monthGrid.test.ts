/** Pinned before anything builds a date, per CLAUDE.md. */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { buildMonthGrid, type CalendarEvent } from "@/lib/calendar/monthGrid";

const COLUMN = 100 / 7;

function event(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "startAt" | "endAt">): CalendarEvent {
  return {
    id: "e1",
    type: "duty",
    label: "Flight duty",
    shortLabel: "Duty",
    ...overrides,
  };
}

describe("buildMonthGrid", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect",
    );
  });

  describe("the grid itself", () => {
    it("starts on the Monday before the first of the month and fills whole weeks", () => {
      // 1 August 2026 is a Saturday, so the first week leads with 27–31 July.
      const grid = buildMonthGrid(2026, 7, []);

      assert.equal(grid.weeks[0].days[0].dateKey, "2026-07-27");
      assert.equal(grid.weeks[0].days[0].inMonth, false);
      assert.equal(grid.weeks[0].days[5].dateKey, "2026-08-01");
      assert.equal(grid.weeks[0].days[5].inMonth, true);

      for (const week of grid.weeks) assert.equal(week.days.length, 7);
      const last = grid.weeks[grid.weeks.length - 1];
      assert.equal(last.days[6].dateKey, "2026-09-06");
      assert.equal(last.days[6].inMonth, false);
    });

    it("draws nothing at all in a week with nothing on it", () => {
      const grid = buildMonthGrid(2026, 7, []);
      assert.deepEqual(grid.weeks[0].segments, []);
    });
  });

  describe("placing one event", () => {
    it("puts a bar at its true start and its true width", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          startAt: buildTurkeyDate(2026, 7, 5, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 18, 0),
        }),
      ]);

      // 5 August 2026 is a Wednesday: the third column, a quarter of the way into it at 06:00,
      // and half a column wide for the twelve hours. Nothing is centred and nothing is padded —
      // the bar's edges are the times.
      const [segment] = grid.weeks[1].segments;
      assert.equal(segment.leftPercent.toFixed(2), (2.25 * COLUMN).toFixed(2));
      assert.equal(segment.widthPercent.toFixed(2), (0.5 * COLUMN).toFixed(2));
    });

    it("keeps the true width of a bar spanning several days", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          startAt: buildTurkeyDate(2026, 7, 4, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 6, 18, 0),
        }),
      ]);

      // Tuesday 06:00 to Thursday 18:00 — two and a half day columns, starting inside Tuesday.
      const [segment] = grid.weeks[1].segments;
      assert.equal(segment.leftPercent.toFixed(2), (1.25 * COLUMN).toFixed(2));
      assert.equal(segment.widthPercent.toFixed(2), (2.5 * COLUMN).toFixed(2));
    });

    it("draws a 90-minute transit at its true width, small as that is", () => {
      // 0.89% of a week. The old readability floor was a tenth of a week and would have swollen
      // this to a day and a half, which is the whole reason it came down.
      const grid = buildMonthGrid(2026, 7, [
        event({
          type: "transit",
          label: "Transit to stn",
          shortLabel: "Transit",
          startAt: buildTurkeyDate(2026, 7, 5, 12, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 13, 30),
        }),
      ]);

      const [segment] = grid.weeks[1].segments;
      assert.equal(segment.widthPercent.toFixed(2), (0.0625 * COLUMN).toFixed(2));
    });

    it("widens a bar too thin to see, pushing its end rather than moving its start", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          type: "transit",
          label: "Transit to stn",
          shortLabel: "Transit",
          startAt: buildTurkeyDate(2026, 7, 5, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 6, 20),
        }),
      ]);

      // Twenty minutes is 0.20% of a week, under the 0.70% minimum.
      const [segment] = grid.weeks[1].segments;
      assert.equal(segment.widthPercent.toFixed(2), "0.70");
      assert.equal(
        segment.leftPercent.toFixed(2),
        (2.25 * COLUMN).toFixed(2),
        "still standing at 06:00",
      );
      assert.ok(
        segment.leftPercent + segment.widthPercent <= 3 * COLUMN,
        "and the widening is small enough not to spill into Thursday",
      );
    });
  });

  describe("what a bar says", () => {
    it("carries the full label when there is room for one", () => {
      // Twelve hours is 7.14% of a week, over the 7% the full label needs.
      const grid = buildMonthGrid(2026, 7, [
        event({
          startAt: buildTurkeyDate(2026, 7, 5, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 18, 0),
        }),
      ]);

      assert.equal(grid.weeks[1].segments[0].label, "Flight duty");
    });

    it("shortens the label on a narrower bar", () => {
      // Eight hours: 4.76%, which holds "Duty" but not "Flight duty".
      const grid = buildMonthGrid(2026, 7, [
        event({
          startAt: buildTurkeyDate(2026, 7, 5, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 14, 0),
        }),
      ]);

      assert.equal(grid.weeks[1].segments[0].label, "Duty");
    });

    it("says nothing at all on a bar with no room for a word", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          type: "transit",
          label: "Transit to stn",
          shortLabel: "Transit",
          startAt: buildTurkeyDate(2026, 7, 5, 12, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 13, 30),
        }),
      ]);

      assert.equal(
        grid.weeks[1].segments[0].label,
        "",
        "a transit bar is a stripe of colour; its name is in the panel",
      );
    });

    it("prints no times, whatever the width", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          startAt: buildTurkeyDate(2026, 7, 4, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 6, 18, 0),
        }),
      ]);

      const [segment] = grid.weeks[1].segments;
      assert.ok(!/\d/.test(segment.label), `the bar's own text is a label only: ${segment.label}`);
    });
  });

  describe("what the detail panel reads", () => {
    it("carries the whole record as fields, not as a string to cut apart", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          detail: "3 duties combined",
          startAt: buildTurkeyDate(2026, 7, 5, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 18, 0),
        }),
      ]);

      const [segment] = grid.weeks[1].segments;
      assert.equal(segment.title, "Flight duty");
      assert.equal(segment.dayLabel, "Wed 05 Aug");
      assert.equal(segment.localRange, "06:00 → 18:00");
      assert.equal(segment.utcRange, "03:00 → 15:00", "Türkiye is UTC+3, all year");
      assert.equal(segment.note, "3 duties combined");
      assert.equal(segment.isTentative, false, "a duty is never speculative");
    });

    it("marks a bar the pilot has not committed to, so it can be drawn faded", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          type: "train",
          label: "Train ride",
          shortLabel: "Train",
          isTentative: true,
          detail: "suggested, not committed",
          startAt: buildTurkeyDate(2026, 7, 5, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 8, 30),
        }),
      ]);

      assert.equal(grid.weeks[1].segments[0].isTentative, true);
    });

    it("names both days when the event runs over more than one", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          startAt: buildTurkeyDate(2026, 7, 4, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 6, 18, 0),
        }),
      ]);

      assert.equal(grid.weeks[1].segments[0].dayLabel, "Tue 04 Aug → Thu 06 Aug");
    });

    it("carries the exact instants in the tooltip, whatever the bar's width says", () => {
      const startAt = buildTurkeyDate(2026, 7, 5, 6, 0);
      const endAt = buildTurkeyDate(2026, 7, 5, 6, 20);
      const grid = buildMonthGrid(2026, 7, [event({ startAt, endAt })]);

      const [segment] = grid.weeks[1].segments;
      assert.ok(segment.tooltip.includes(startAt.toISOString()));
      assert.ok(segment.tooltip.includes(endAt.toISOString()));
      assert.ok(segment.tooltip.includes("06:00 → 06:20"));
    });
  });

  describe("events that cross a week boundary", () => {
    it("splits into a head and a continuation", () => {
      // Saturday 8 August into Tuesday 11 August 2026 — two days in the first week, two in the
      // second, so the head is wide enough to carry its full label.
      const grid = buildMonthGrid(2026, 7, [
        event({
          startAt: buildTurkeyDate(2026, 7, 8, 8, 0),
          endAt: buildTurkeyDate(2026, 7, 11, 16, 0),
        }),
      ]);

      const head = grid.weeks[1].segments[0];
      const tail = grid.weeks[2].segments[0];

      assert.equal(head.isHead, true);
      assert.equal(head.label, "Flight duty");
      assert.equal(tail.isHead, false);
      assert.equal(tail.label, "continues");
      assert.equal(
        tail.leftPercent,
        0,
        "flush at the week's edge — the event was already running at Monday midnight",
      );
      assert.notEqual(head.key, tail.key, "two segments, two keys");
    });

    it("gives both halves the same answer when either is clicked", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          startAt: buildTurkeyDate(2026, 7, 8, 8, 0),
          endAt: buildTurkeyDate(2026, 7, 11, 16, 0),
        }),
      ]);

      const head = grid.weeks[1].segments[0];
      const tail = grid.weeks[2].segments[0];

      // The panel describes the event, not the piece of it the week cut off — a continuation that
      // reported its own clipped span would invent a duty ending at Sunday midnight.
      assert.deepEqual(
        { title: tail.title, dayLabel: tail.dayLabel, localRange: tail.localRange },
        { title: head.title, dayLabel: head.dayLabel, localRange: head.localRange },
      );
      assert.equal(tail.dayLabel, "Sat 08 Aug → Tue 11 Aug");
      assert.equal(tail.localRange, "08:00 → 16:00");
    });
  });

  describe("bars that would collide", () => {
    it("moves the later one to where the earlier one ended, rather than overprinting", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          id: "duty",
          startAt: buildTurkeyDate(2026, 7, 4, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 6, 18, 0),
        }),
        event({
          id: "train",
          type: "train",
          label: "Train ride",
          shortLabel: "Train",
          startAt: buildTurkeyDate(2026, 7, 5, 9, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 12, 30),
        }),
      ]);

      const [duty, train] = grid.weeks[1].segments;
      assert.equal(
        duty.leftPercent.toFixed(2),
        (1.25 * COLUMN).toFixed(2),
        "the earlier bar keeps the time the roster prints",
      );
      assert.equal(
        train.leftPercent.toFixed(6),
        (duty.leftPercent + duty.widthPercent).toFixed(6),
        "and the later one starts exactly where it finished",
      );
    });

    it("leaves bars that merely abut exactly where they are, so the line reads as continuous", () => {
      // The shape this calendar exists to draw: duty released at noon, transit off the back of it,
      // train off the back of that.
      const grid = buildMonthGrid(2026, 7, [
        event({
          id: "duty",
          startAt: buildTurkeyDate(2026, 7, 5, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 12, 0),
        }),
        event({
          id: "transit",
          type: "transit",
          label: "Transit to stn",
          shortLabel: "Transit",
          startAt: buildTurkeyDate(2026, 7, 5, 12, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 13, 30),
        }),
        event({
          id: "train",
          type: "train",
          label: "Train ride",
          shortLabel: "Train",
          startAt: buildTurkeyDate(2026, 7, 5, 13, 30),
          endAt: buildTurkeyDate(2026, 7, 5, 16, 0),
        }),
      ]);

      const week = grid.weeks[1];
      assert.deepEqual(
        week.segments.map((s) => s.type),
        ["duty", "transit", "train"],
      );
      for (let i = 1; i < week.segments.length; i++) {
        const previous = week.segments[i - 1];
        assert.equal(
          week.segments[i].leftPercent.toFixed(6),
          (previous.leftPercent + previous.widthPercent).toFixed(6),
          `no gap and no overlap between bar ${i - 1} and bar ${i}`,
        );
      }
      assert.equal(
        week.segments[0].leftPercent.toFixed(2),
        (2.25 * COLUMN).toFixed(2),
        "and none of them was pushed off its true start",
      );
    });

    it("orders by the instant, not by the day, so two bars on one day cannot swap", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          id: "evening",
          startAt: buildTurkeyDate(2026, 7, 5, 18, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 22, 0),
        }),
        event({
          id: "morning",
          startAt: buildTurkeyDate(2026, 7, 5, 6, 0),
          endAt: buildTurkeyDate(2026, 7, 5, 10, 0),
        }),
      ]);

      assert.deepEqual(
        grid.weeks[1].segments.map((s) => s.key),
        ["2026-7:morning:2026-08-05", "2026-7:evening:2026-08-05"],
      );
    });
  });

  describe("bars with no width left to them", () => {
    /*
     * An event nested wholly inside another is not a shape the ribbon can lay out, and
     * `mergeAdjacent` in the view above is what keeps it from arising. These two cover what the
     * geometry does anyway if it ever did — the case that used to emit a button nobody could see.
     */
    function nested() {
      return buildMonthGrid(2026, 7, [
        event({
          id: "outer",
          startAt: buildTurkeyDate(2026, 7, 9, 20, 0),
          endAt: buildTurkeyDate(2026, 7, 10, 8, 0),
        }),
        event({
          id: "inner",
          type: "train",
          label: "Train ride",
          shortLabel: "Train",
          startAt: buildTurkeyDate(2026, 7, 9, 22, 0),
          endAt: buildTurkeyDate(2026, 7, 10, 6, 0),
        }),
      ]);
    }

    it("are dropped rather than left in the tab order as invisible buttons", () => {
      for (const week of nested().weeks) {
        for (const segment of week.segments) {
          assert.ok(segment.widthPercent > 0, `${segment.key} was drawn with no width`);
        }
      }
    });

    it("hand the event over to its continuation when the head was the piece dropped", () => {
      // Sunday's sliver of the train is squeezed out at the week's right edge, so Monday's piece
      // is the first one the pilot can see — and "continues" on it would point back at nothing.
      const tail = nested().weeks[2].segments.find((s) => s.title === "Train ride");
      assert.equal(tail?.isHead, true);
      assert.equal(tail?.localRange, "22:00 → 06:00", "still describing the whole event");
    });
  });

  describe("keys", () => {
    it("names the grid, so the two months of a roster that crosses an end can't collide", () => {
      // 31 August 2026 is a Monday, so the August grid's last week and the September grid's first
      // are the same seven days, drawn from the same events. The component matches the selected
      // bar by key across every month it was handed.
      const events = [
        event({ id: "d99", startAt: buildTurkeyDate(2026, 7, 31, 6, 0), endAt: buildTurkeyDate(2026, 7, 31, 18, 0) }),
      ];
      const august = buildMonthGrid(2026, 7, events);
      const september = buildMonthGrid(2026, 8, events);

      const inAugust = august.weeks[august.weeks.length - 1].segments[0];
      const inSeptember = september.weeks[0].segments[0];

      assert.equal(inAugust.dayLabel, "Mon 31 Aug", "the same duty, drawn in both grids");
      assert.equal(inSeptember.dayLabel, "Mon 31 Aug");
      assert.notEqual(inAugust.key, inSeptember.key, "but not the same bar to click");
    });
  });

  describe("a duty released at exactly midnight", () => {
    it("ends on the day it was flown, not as a sliver on the next one", () => {
      const grid = buildMonthGrid(2026, 7, [
        event({
          startAt: buildTurkeyDate(2026, 7, 5, 18, 0),
          endAt: buildTurkeyDate(2026, 7, 6, 0, 0),
        }),
      ]);

      // One segment, on Wednesday the 5th, and nothing at all on the 6th.
      const week = grid.weeks[1];
      assert.equal(week.segments.length, 1);
      const [segment] = week.segments;
      const thursdayStart = 3 * COLUMN;
      assert.ok(
        segment.leftPercent + segment.widthPercent <= thursdayStart + 0.001,
        "the bar stops at the day boundary",
      );
      assert.equal(segment.dayLabel, "Wed 05 Aug");
    });
  });
});
