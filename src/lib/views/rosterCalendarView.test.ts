/** Pinned before anything builds a date, per CLAUDE.md. */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import {
  assembleRosterCalendarView,
  windowsWorthSuggesting,
  type RosterCalendarViewInput,
  type RosterCalendarViewPilot,
} from "@/lib/views/rosterCalendarView";
import type { SerializedTrainOption } from "@/lib/trains/serialized";

const PILOT: RosterCalendarViewPilot = {
  crewId: "12345",
  name: "Test Pilot",
  aircraftType: "A320",
  airportTransferMinutes: 90,
  minOffHours: 24,
};

function train(departureAt: Date, arrivalAt: Date): SerializedTrainOption {
  return {
    trainNumber: "81034",
    originCode: "IST",
    destinationCode: "ESK",
    departureAt: departureAt.toISOString(),
    arrivalAt: arrivalAt.toISOString(),
    durationMinutes: Math.round((arrivalAt.getTime() - departureAt.getTime()) / 60_000),
    source: "live",
    bookingUrl: "https://ebilet.tcddtasimacilik.gov.tr/sefer-listesi-yonlendirme?x=1",
  };
}

function makeInput(overrides: Partial<RosterCalendarViewInput> = {}): RosterCalendarViewInput {
  return {
    pilot: PILOT,
    schedule: { period: "AUG 2026", duties: [], trips: [] },
    ...overrides,
  };
}

/** Every segment on the grid, with the label it was drawn with. */
function segments(view: ReturnType<typeof assembleRosterCalendarView>) {
  return view.months.flatMap((month) =>
    month.weeks.flatMap((week) => week.segments.map((s) => ({ type: s.type, label: s.label }))),
  );
}

describe("assembleRosterCalendarView", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect",
    );
  });

  describe("duties", () => {
    it("draws flight duty and home standby, and leaves days off empty", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            trips: [],
            duties: [
              {
                id: "d1",
                type: "FLIGHT",
                startAt: buildTurkeyDate(2026, 7, 4, 6, 0),
                endAt: buildTurkeyDate(2026, 7, 6, 18, 0),
              },
              {
                id: "d2",
                type: "HSBY",
                startAt: buildTurkeyDate(2026, 7, 10, 6, 0),
                endAt: buildTurkeyDate(2026, 7, 12, 18, 0),
              },
              {
                id: "d3",
                type: "DAYOFF",
                startAt: buildTurkeyDate(2026, 7, 14, 0, 0),
                endAt: buildTurkeyDate(2026, 7, 15, 0, 0),
              },
            ],
          },
        }),
      );

      assert.deepEqual(segments(view), [
        { type: "duty", label: "Flight duty" },
        { type: "standby", label: "Home standby" },
      ]);
    });
  });

  describe("adjacent duties", () => {
    /** A duty on the given August day, 06:00 to 18:00 Türkiye. */
    function duty(id: string, day: number, type = "FLIGHT") {
      return {
        id,
        type,
        startAt: buildTurkeyDate(2026, 7, day, 6, 0),
        endAt: buildTurkeyDate(2026, 7, day, 18, 0),
      };
    }

    it("folds duties into one bar when the gap between them is too short to travel in", () => {
      // 12 hours between release and next report, against a 24-hour threshold.
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            trips: [],
            duties: [duty("d1", 4), duty("d2", 5), duty("d3", 6)],
          },
        }),
      );

      const all = view.months.flatMap((m) => m.weeks.flatMap((w) => w.segments));
      assert.equal(all.length, 1, "three duties, one bar");
      assert.ok(all[0].tooltip.includes("3 duties combined"), all[0].tooltip);
      assert.ok(all[0].tooltip.includes("06:00 → 18:00"), "spanning the first report to the last release");
    });

    it("leaves a gap the pilot could travel in standing", () => {
      // A day off between them: 36 hours, over the threshold.
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            trips: [],
            duties: [duty("d1", 4), duty("d2", 6)],
          },
        }),
      );

      const all = view.months.flatMap((m) => m.weeks.flatMap((w) => w.segments));
      assert.equal(all.length, 2);
      assert.ok(!all[0].tooltip.includes("combined"), "and says nothing about combining");
    });

    it("follows the pilot's own threshold rather than a fixed one", () => {
      const schedule = {
        period: "AUG 2026",
        trips: [],
        duties: [duty("d1", 4), duty("d2", 6)],
      };

      const strict = assembleRosterCalendarView(
        makeInput({ pilot: { ...PILOT, minOffHours: 48 }, schedule }),
      );
      const relaxed = assembleRosterCalendarView(
        makeInput({ pilot: { ...PILOT, minOffHours: 24 }, schedule }),
      );

      assert.equal(strict.months[0].weeks.flatMap((w) => w.segments).length, 1);
      assert.equal(relaxed.months[0].weeks.flatMap((w) => w.segments).length, 2);
    });

    it("measures the gap the way the schedule page does, with the transfers taken off it", () => {
      // Release 18:00 on the 4th to report 19:00 on the 5th: 25 raw hours, but 22 once the
      // 90-minute transfer at each end is gone. The schedule page hides that window; a calendar
      // that left the gap standing would be showing a break the rest of the app denies.
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            trips: [],
            duties: [
              duty("d1", 4),
              {
                id: "d2",
                type: "FLIGHT",
                startAt: buildTurkeyDate(2026, 7, 5, 19, 0),
                endAt: buildTurkeyDate(2026, 7, 6, 6, 0),
              },
            ],
          },
        }),
      );

      const all = view.months.flatMap((m) => m.weeks.flatMap((w) => w.segments));
      assert.equal(all.length, 1, "25 raw hours, 22 travellable ones, one bar");
    });

    it("never folds a gap the pilot has committed a trip in, however short it measures", () => {
      /*
       * Reachable without doing anything odd: commit in a 25-hour window, then raise the minimum
       * off-period. The commit route has no threshold of its own. Folding here would bury the trip
       * under a duty bar it sits wholly inside — which is also the one shape the grid can't lay
       * out.
       */
      const windowStartAt = buildTurkeyDate(2026, 7, 4, 18, 0);
      const windowEndAt = buildTurkeyDate(2026, 7, 5, 19, 0);
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            duties: [
              duty("d1", 4),
              {
                id: "d2",
                type: "FLIGHT",
                startAt: windowEndAt,
                endAt: buildTurkeyDate(2026, 7, 6, 6, 0),
              },
            ],
            trips: [
              {
                id: "c1",
                cancelledAt: null,
                isCommitted: true,
                windowStartAt,
                windowEndAt,
                outboundTrain: train(
                  buildTurkeyDate(2026, 7, 4, 20, 0),
                  buildTurkeyDate(2026, 7, 4, 22, 30),
                ),
                returnTrain: train(
                  buildTurkeyDate(2026, 7, 5, 14, 0),
                  buildTurkeyDate(2026, 7, 5, 16, 30),
                ),
              },
            ],
          },
        }),
      );

      assert.deepEqual(
        segments(view)
          .map((s) => s.type)
          .sort(),
        ["duty", "duty", "train", "train", "transit", "transit"],
        "two duty bars with the trip drawn in the gap between them",
      );
    });

    it("never merges standby into flight duty", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            trips: [],
            duties: [duty("d1", 4), duty("d2", 5, "HSBY")],
          },
        }),
      );

      assert.deepEqual(
        segments(view).map((s) => s.type),
        ["duty", "standby"],
      );
    });
  });

  describe("a committed trip", () => {
    /*
     * A window from duty release at noon on the 7th to the next report at 20:00 on the 9th, with
     * the trains sitting well inside it. The window bounds are what the transit bars are drawn
     * against, so they are the fixture's load-bearing half, not scenery.
     */
    const commitment = {
      id: "c1",
      cancelledAt: null,
      isCommitted: true,
      windowStartAt: buildTurkeyDate(2026, 7, 7, 12, 0),
      windowEndAt: buildTurkeyDate(2026, 7, 9, 20, 0),
      outboundTrain: train(
        buildTurkeyDate(2026, 7, 7, 14, 0),
        buildTurkeyDate(2026, 7, 7, 16, 30),
      ),
      returnTrain: train(
        buildTurkeyDate(2026, 7, 9, 9, 0),
        buildTurkeyDate(2026, 7, 9, 11, 30),
      ),
    };

    /** Both transit bars of the first trip on the grid, or undefined where one wasn't drawn. */
    function transits(view: ReturnType<typeof assembleRosterCalendarView>) {
      const all = view.months.flatMap((m) => m.weeks.flatMap((w) => w.segments));
      return {
        out: all.find((s) => s.tooltip.startsWith("Transit to stn")),
        back: all.find((s) => s.tooltip.startsWith("Transit to apt")),
      };
    }

    it("draws both train rides and a transfer at each end", () => {
      const view = assembleRosterCalendarView(
        makeInput({ schedule: { period: "AUG 2026", duties: [], trips: [commitment] } }),
      );

      assert.deepEqual(
        segments(view)
          .map((s) => s.type)
          .sort(),
        ["train", "train", "transit", "transit"],
      );
    });

    it("runs each transit off the duty edge, for the pilot's own transfer time", () => {
      const view = assembleRosterCalendarView(
        makeInput({ schedule: { period: "AUG 2026", duties: [], trips: [commitment] } }),
      );

      // Out from the moment of release, and back so as to be at the airport at report time —
      // 90 minutes at each end, and not a minute of it hanging off the train instead. The return
      // train landed at 11:30, seven hours before its transit bar starts, and that is the point:
      // the bar belongs to the duty it touches.
      const { out, back } = transits(view);
      assert.ok(out?.tooltip.includes("12:00 → 13:30"), out?.tooltip);
      assert.ok(back?.tooltip.includes("18:30 → 20:00"), back?.tooltip);
    });

    it("re-derives the transfer from the setting rather than storing it", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          pilot: { ...PILOT, airportTransferMinutes: 30 },
          schedule: { period: "AUG 2026", duties: [], trips: [commitment] },
        }),
      );

      const { out, back } = transits(view);
      assert.ok(out?.tooltip.includes("12:00 → 12:30"), out?.tooltip);
      assert.ok(back?.tooltip.includes("19:30 → 20:00"), back?.tooltip);
    });

    it("stops the outbound transit at a train that leaves before the transfer would be over", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            duties: [],
            trips: [
              {
                ...commitment,
                outboundTrain: train(
                  buildTurkeyDate(2026, 7, 7, 12, 45),
                  buildTurkeyDate(2026, 7, 7, 15, 15),
                ),
              },
            ],
          },
        }),
      );

      // 45 minutes, not 90: the timetable wins, because the train is a fact and the transfer is a
      // budget. Overrunning it would draw the pilot still travelling to a station they had left.
      const { out } = transits(view);
      assert.ok(out?.tooltip.includes("12:00 → 12:45"), out?.tooltip);
    });

    it("omits a transit bar rather than drawing one with nothing in it", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            duties: [],
            trips: [
              {
                ...commitment,
                // Departing on release and landing at report time: no room at either end.
                outboundTrain: train(
                  buildTurkeyDate(2026, 7, 7, 12, 0),
                  buildTurkeyDate(2026, 7, 7, 14, 30),
                ),
                returnTrain: train(
                  buildTurkeyDate(2026, 7, 9, 17, 30),
                  buildTurkeyDate(2026, 7, 9, 20, 0),
                ),
              },
            ],
          },
        }),
      );

      assert.deepEqual(
        segments(view).map((s) => s.type),
        ["train", "train"],
        "a zero-length bar would be widened to the minimum and read as a real leg",
      );
    });

    it("draws no transfer at all when the pilot set none", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          pilot: { ...PILOT, airportTransferMinutes: 0 },
          schedule: { period: "AUG 2026", duties: [], trips: [commitment] },
        }),
      );

      assert.deepEqual(
        segments(view).map((s) => s.type),
        ["train", "train"],
      );
    });

    it("leaves a cancelled plan off the calendar entirely", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            duties: [],
            trips: [{ ...commitment, cancelledAt: buildTurkeyDate(2026, 7, 6, 9, 0) }],
          },
        }),
      );

      assert.deepEqual(segments(view), []);
    });
  });

  describe("a suggested trip", () => {
    it("carries the same four bars as a committed one, marked as not booked", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            duties: [],
            trips: [
              {
                id: "s1",
                cancelledAt: null,
                isCommitted: false,
                windowStartAt: buildTurkeyDate(2026, 7, 7, 12, 0),
                windowEndAt: buildTurkeyDate(2026, 7, 9, 20, 0),
                outboundTrain: train(
                  buildTurkeyDate(2026, 7, 7, 14, 0),
                  buildTurkeyDate(2026, 7, 7, 16, 30),
                ),
                returnTrain: train(
                  buildTurkeyDate(2026, 7, 9, 9, 0),
                  buildTurkeyDate(2026, 7, 9, 11, 30),
                ),
              },
            ],
          },
        }),
      );

      const all = view.months.flatMap((m) => m.weeks.flatMap((w) => w.segments));
      assert.equal(all.length, 4, "two trains and two transfers, same as a committed trip");
      for (const segment of all) {
        assert.ok(
          segment.tooltip.includes("suggested, not committed"),
          `every bar of a suggestion says so: ${segment.tooltip}`,
        );
        assert.equal(
          segment.isTentative,
          true,
          "and is drawn faded, so scanning the month tells them apart without a click",
        );
      }
    });
  });

  describe("where the times came from", () => {
    const windowStartAt = buildTurkeyDate(2026, 7, 7, 12, 0);
    const windowEndAt = buildTurkeyDate(2026, 7, 9, 20, 0);

    function tripWith(source: SerializedTrainOption["source"]) {
      const outbound = train(
        buildTurkeyDate(2026, 7, 7, 14, 0),
        buildTurkeyDate(2026, 7, 7, 16, 30),
      );
      return {
        id: "c1",
        cancelledAt: null,
        isCommitted: true,
        windowStartAt,
        windowEndAt,
        outboundTrain: { ...outbound, source },
        returnTrain: train(
          buildTurkeyDate(2026, 7, 9, 9, 0),
          buildTurkeyDate(2026, 7, 9, 11, 30),
        ),
      };
    }

    it("says so when a leg fell back to the curated timetable", () => {
      // A failing live request is this integration's steady state, and the bars print times to the
      // minute either way — so the page has to be able to caveat them.
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: { period: "AUG 2026", duties: [], trips: [tripWith("estimate")] },
        }),
      );

      assert.equal(view.hasEstimates, true);
    });

    it("says nothing of the sort when every leg is live", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: { period: "AUG 2026", duties: [], trips: [tripWith("live")] },
        }),
      );

      assert.equal(view.hasEstimates, false);
    });
  });

  describe("which windows are worth asking the timetable about", () => {
    const NOW = buildTurkeyDate(2026, 7, 1, 0, 0);

    /** A window `hours` long, starting midday on the given August day. */
    function gap(
      id: string,
      day: number,
      hours: number,
      overrides: Partial<{
        travelEligible: boolean;
        commitment: { cancelledAt: Date | null } | null;
      }> = {},
    ) {
      const startAt = buildTurkeyDate(2026, 7, day, 12, 0);
      return {
        id,
        startAt,
        endAt: new Date(startAt.getTime() + hours * 3_600_000),
        travelEligible: true,
        commitment: null,
        ...overrides,
      };
    }

    it("takes a window that clears the threshold once the transfers are subtracted", () => {
      const windows = [gap("long", 10, 30), gap("short", 12, 25)];

      assert.deepEqual(
        windowsWorthSuggesting(windows, PILOT, NOW).map((w) => w.id),
        ["long"],
        "25h minus two 90-minute transfers is 22h, under the 24h threshold",
      );
    });

    it("leaves a window that already has a live plan alone", () => {
      const windows = [
        gap("planned", 10, 30, { commitment: { cancelledAt: null } }),
        gap("dropped", 14, 30, { commitment: { cancelledAt: buildTurkeyDate(2026, 7, 2, 9, 0) } }),
      ];

      assert.deepEqual(
        windowsWorthSuggesting(windows, PILOT, NOW).map((w) => w.id),
        ["dropped"],
        "a cancelled plan is not a plan, so that window is open to suggestion again",
      );
    });

    it("skips a window adjacent to standby, which is not travellable at all", () => {
      const windows = [gap("standby", 10, 30, { travelEligible: false })];
      assert.deepEqual(windowsWorthSuggesting(windows, PILOT, NOW), []);
    });

    it("skips a window that has already closed", () => {
      const windows = [gap("gone", 2, 30), gap("ahead", 20, 30)];

      assert.deepEqual(
        windowsWorthSuggesting(windows, PILOT, buildTurkeyDate(2026, 7, 15, 9, 0)).map((w) => w.id),
        ["ahead"],
        "nothing can be booked in a window that is over, so it is not worth a request",
      );
    });
  });

  describe("the months drawn", () => {
    it("draws one grid for a roster inside a single month", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            trips: [],
            duties: [
              {
                id: "d1",
                type: "FLIGHT",
                startAt: buildTurkeyDate(2026, 7, 4, 6, 0),
                endAt: buildTurkeyDate(2026, 7, 6, 18, 0),
              },
            ],
          },
        }),
      );

      assert.equal(view.months.length, 1);
      assert.deepEqual({ year: view.months[0].year, month: view.months[0].month }, {
        year: 2026,
        month: 7,
      });
    });

    it("draws both when a roster runs over the month end, rather than losing the overflow", () => {
      const view = assembleRosterCalendarView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            trips: [],
            duties: [
              {
                id: "d1",
                type: "FLIGHT",
                startAt: buildTurkeyDate(2026, 7, 30, 6, 0),
                endAt: buildTurkeyDate(2026, 8, 1, 18, 0),
              },
            ],
          },
        }),
      );

      assert.deepEqual(
        view.months.map((m) => `${m.year}-${m.month}`),
        ["2026-7", "2026-8"],
      );
    });

    it("has nothing to draw for a pilot who has uploaded nothing", () => {
      const view = assembleRosterCalendarView(makeInput({ schedule: null }));

      assert.equal(view.hasSchedule, false);
      assert.equal(view.period, null);
      assert.deepEqual(view.months, []);
      assert.equal(view.crewId, "12345");
    });
  });
});
