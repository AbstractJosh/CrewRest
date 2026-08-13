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
function gap(id: string, day: number, hours: number) {
  const startAt = buildTurkeyDate(2026, 7, day, 12, 0);
  return {
    id,
    startAt,
    endAt: new Date(startAt.getTime() + hours * 3_600_000),
    travelEligible: true,
  };
}

function makeInput(overrides: Partial<PilotScheduleViewInput> = {}): PilotScheduleViewInput {
  return {
    pilot: PILOT,
    schedule: { period: "AUG 2026", offWindows: [], dutyPeriods: [] },
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
            dutyPeriods: [],
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
          schedule: { period: "AUG 2026", dutyPeriods: [], offWindows: [gap("tiny", 10, 2)] },
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
          schedule: { period: "AUG 2026", dutyPeriods: [], offWindows: windows },
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
        dutyPeriods: [],
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

  describe("duty periods", () => {
    it("resolves the flight-legs JSON column once, defaulting to none", () => {
      const view = assemblePilotScheduleView(
        makeInput({
          schedule: {
            period: "AUG 2026",
            offWindows: [],
            dutyPeriods: [
              {
                id: "d1",
                startAt: buildTurkeyDate(2026, 7, 5, 6, 0),
                endAt: buildTurkeyDate(2026, 7, 5, 14, 0),
                type: "FLIGHT",
                rawCode: "TK123",
                flightLegs: [
                  {
                    flightNumber: "TK123",
                    origin: "IST",
                    destination: "ESB",
                    departureTime: "07:00",
                    arrivalTime: "08:15",
                  },
                ],
              },
              {
                id: "d2",
                startAt: buildTurkeyDate(2026, 7, 6, 0, 0),
                endAt: buildTurkeyDate(2026, 7, 7, 0, 0),
                type: "DAYOFF",
                rawCode: "OFF",
                flightLegs: null,
              },
            ],
          },
        }),
      );

      assert.equal(view.dutyPeriods[0].flightLegs.length, 1);
      assert.equal(view.dutyPeriods[0].flightLegs[0].flightNumber, "TK123");
      assert.deepEqual(view.dutyPeriods[1].flightLegs, [], "a day off has no legs, not null");
    });
  });

  describe("a pilot with nothing uploaded", () => {
    it("reports no schedule rather than an empty one", () => {
      const view = assemblePilotScheduleView(makeInput({ schedule: null }));

      assert.equal(view.hasSchedule, false);
      assert.equal(view.period, null);
      assert.deepEqual(view.shownWindows, []);
      assert.deepEqual(view.hiddenWindows, []);
      assert.deepEqual(view.dutyPeriods, []);
      assert.equal(view.name, "Test Pilot");
      assert.equal(view.crewId, "12345");
    });
  });
});
