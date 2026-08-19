/** Pinned before anything builds a date, per CLAUDE.md. */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import {
  assemblePilotScheduleView,
  type PilotScheduleViewInput,
  type PilotScheduleViewPilot,
} from "@/lib/views/pilotScheduleView";

const PILOT: PilotScheduleViewPilot = {
  crewId: "12345",
  name: "Test Pilot",
  aircraftType: "A320",
  minOffHours: 24,
  airportTransferMinutes: 90,
};

/** An off-window `hours` long, starting at midday on the given August day. */
function gap(
  id: string,
  day: number,
  hours: number,
  commitment: { cancelledAt: Date | null } | null = null,
) {
  const startAt = buildTurkeyDate(2026, 7, day, 12, 0);
  return {
    id,
    startAt,
    endAt: new Date(startAt.getTime() + hours * 3_600_000),
    travelEligible: true,
    commitment,
  };
}

/**
 * Before every window `gap()` can build, so the existing threshold and plan-state cases see a
 * roster entirely in the future and stay about what they were written to test.
 */
const BEFORE_THE_ROSTER = buildTurkeyDate(2026, 7, 1, 0, 0);

function makeInput(overrides: Partial<PilotScheduleViewInput> = {}): PilotScheduleViewInput {
  return {
    pilot: PILOT,
    schedule: { period: "AUG 2026", offWindows: [] },
    now: BEFORE_THE_ROSTER,
    ...overrides,
  };
}

describe("assemblePilotScheduleView", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect",
    );
  });

  describe("the minimum-off-hours threshold", () => {
    it("measures the threshold against travel time, not the raw gap", () => {
      // The distinction that makes this worth testing: with a 90-minute transfer, a 25-hour gap
      // leaves 23h30 to actually travel and so misses a 24-hour threshold, while a 26-hour gap
      // clears it. Comparing against the raw gap would show both.
      const view = assemblePilotScheduleView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            offWindows: [gap("short", 10, 25), gap("long", 20, 26)],
          },
        }),
      );

      assert.deepEqual(
        view.shownWindows.map((w) => w.id),
        ["long"],
      );
      assert.deepEqual(
        view.hiddenWindows.map((w) => w.id),
        ["short"],
      );
      assert.equal(view.shownWindows[0].travel.minutes, 26 * 60 - 90);
    });

    it("hides a gap the transfers swallow entirely, however the threshold is set", () => {
      // 2 hours of gap against 90 minutes of transfer at each end: there is no round trip here
      // at all, so it must not be offered even to a pilot who set their threshold to 1 hour.
      const view = assemblePilotScheduleView(
        makeInput({
          pilot: { ...PILOT, minOffHours: 1 },
          schedule: { period: "AUG 2026", offWindows: [gap("tiny", 10, 2)] },
        }),
      );

      assert.deepEqual(view.shownWindows, []);
      assert.equal(view.hiddenWindows.length, 1);
      assert.equal(view.hiddenWindows[0].travel.isViable, false);
    });

    it("partitions without dropping or duplicating anything", () => {
      const windows = [gap("a", 5, 10), gap("b", 10, 30), gap("c", 15, 25), gap("d", 20, 48)];
      const view = assemblePilotScheduleView(
        makeInput({
          schedule: { period: "AUG 2026", offWindows: windows },
        }),
      );

      assert.deepEqual(
        [...view.shownWindows, ...view.hiddenWindows].map((w) => w.id).sort(),
        ["a", "b", "c", "d"],
      );
      assert.deepEqual(
        view.shownWindows.map((w) => w.id),
        ["b", "d"],
      );
    });

    it("re-partitions on a changed setting without the stored windows changing", () => {
      // The point of applying both settings at read time: adjusting either must never require
      // re-uploading the roster.
      const schedule = {
        period: "AUG 2026",
        offWindows: [gap("a", 5, 10), gap("b", 10, 30)],
      };

      const strict = assemblePilotScheduleView(makeInput({ schedule }));
      const relaxed = assemblePilotScheduleView(
        makeInput({ pilot: { ...PILOT, minOffHours: 8 }, schedule }),
      );

      assert.deepEqual(strict.shownWindows.map((w) => w.id), ["b"]);
      assert.deepEqual(relaxed.shownWindows.map((w) => w.id), ["a", "b"]);
    });
  });

  describe("plan state", () => {
    it("separates never-planned, planned and dropped windows", () => {
      // The distinction that matters: a cancelled commitment keeps its row (see CLAUDE.md), so
      // testing for the row's existence alone would paint a dropped trip as a live plan.
      const view = assemblePilotScheduleView(
        makeInput({
          pilot: { ...PILOT, minOffHours: 1 },
          schedule: {
            period: "AUG 2026",
            offWindows: [
              gap("untouched", 5, 30),
              gap("live", 10, 30, { cancelledAt: null }),
              gap("dropped", 15, 30, { cancelledAt: buildTurkeyDate(2026, 7, 14, 9, 0) }),
            ],
          },
        }),
      );

      assert.deepEqual(
        view.shownWindows.map((w) => [w.id, w.planState]),
        [
          ["untouched", "open"],
          ["live", "committed"],
          ["dropped", "dropped"],
        ],
      );
    });

    it("still reports plan state for a window below the threshold", () => {
      // Hidden windows render with the same ticket, so leaving planState off them would show a
      // committed short break as though nothing had been planned for it.
      const view = assemblePilotScheduleView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            offWindows: [gap("short", 10, 5, { cancelledAt: null })],
          },
        }),
      );

      assert.deepEqual(view.shownWindows, []);
      assert.equal(view.hiddenWindows[0].planState, "committed");
    });
  });

  describe("windows that have already passed", () => {
    /** Three 30h windows, starting midday on the 2nd, 10th and 20th. */
    const schedule = {
      period: "AUG 2026",
      offWindows: [gap("early", 2, 30), gap("middle", 10, 30), gap("late", 20, 30)],
    };

    it("drops the ones already over and counts them", () => {
      const view = assemblePilotScheduleView(
        makeInput({ schedule, now: buildTurkeyDate(2026, 7, 15, 9, 0) }),
      );

      assert.deepEqual(
        view.shownWindows.map((w) => w.id),
        ["late"],
      );
      assert.equal(view.pastWindowCount, 2);
    });

    /*
     * The window a pilot is sitting in right now is the one they are most likely to be planning,
     * so the cutoff has to be the report-back deadline, not the window's start.
     */
    it("keeps a window that has started but not ended", () => {
      const view = assemblePilotScheduleView(
        makeInput({ schedule, now: buildTurkeyDate(2026, 7, 10, 20, 0) }),
      );

      assert.deepEqual(
        view.shownWindows.map((w) => w.id),
        ["middle", "late"],
      );
      assert.equal(view.pastWindowCount, 1);
    });

    it("treats a window ending exactly now as over", () => {
      const view = assemblePilotScheduleView(
        makeInput({ schedule, now: buildTurkeyDate(2026, 7, 3, 18, 0) }),
      );

      assert.equal(
        view.shownWindows.some((w) => w.id === "early"),
        false,
      );
      assert.equal(view.pastWindowCount, 1);
    });

    it("drops past windows from the below-threshold list too", () => {
      const view = assemblePilotScheduleView(
        makeInput({
          pilot: { ...PILOT, minOffHours: 100 },
          schedule,
          now: buildTurkeyDate(2026, 7, 15, 9, 0),
        }),
      );

      assert.deepEqual(view.shownWindows, [], "100h threshold hides all three");
      assert.deepEqual(
        view.hiddenWindows.map((w) => w.id),
        ["late"],
        "a short break that is also over is doubly useless",
      );
      assert.equal(view.pastWindowCount, 2);
    });

    it("counts nothing as past when the whole roster is ahead", () => {
      const view = assemblePilotScheduleView(makeInput({ schedule }));

      assert.equal(view.shownWindows.length, 3);
      assert.equal(view.pastWindowCount, 0);
    });
  });

  describe("a pilot with nothing uploaded", () => {
    it("reports no schedule rather than an empty one", () => {
      const view = assemblePilotScheduleView(makeInput({ schedule: null }));

      assert.equal(view.hasSchedule, false);
      assert.equal(view.period, null);
      assert.deepEqual(view.shownWindows, []);
      assert.deepEqual(view.hiddenWindows, []);
      assert.equal(view.pastWindowCount, 0);
      assert.equal(view.name, "Test Pilot");
      assert.equal(view.crewId, "12345");
    });
  });
});
