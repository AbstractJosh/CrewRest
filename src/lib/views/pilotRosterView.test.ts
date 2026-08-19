/** Pinned before anything builds a date, per CLAUDE.md. */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import {
  assemblePilotRosterView,
  type PilotRosterViewInput,
  type PilotRosterViewPilot,
} from "@/lib/views/pilotRosterView";

const PILOT: PilotRosterViewPilot = {
  crewId: "12345",
  name: "Test Pilot",
  aircraftType: "A320",
};

function makeInput(overrides: Partial<PilotRosterViewInput> = {}): PilotRosterViewInput {
  return {
    pilot: PILOT,
    schedule: { period: "AUG 2026", dutyPeriods: [] },
    ...overrides,
  };
}

describe("assemblePilotRosterView", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect",
    );
  });

  it("resolves the flight-legs JSON column once, defaulting to none", () => {
    const view = assemblePilotRosterView(
      makeInput({
        schedule: {
          period: "AUG 2026",
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

  it("keeps duties that are already over", () => {
    // The roster is the printed roster: unlike the commute windows next door, nothing here is
    // filtered by the clock, so a pilot can check what they flew last week.
    const view = assemblePilotRosterView(
      makeInput({
        schedule: {
          period: "AUG 2026",
          dutyPeriods: [
            {
              id: "old",
              startAt: buildTurkeyDate(2020, 0, 1, 6, 0),
              endAt: buildTurkeyDate(2020, 0, 1, 14, 0),
              type: "FLIGHT",
              rawCode: "TK1",
              flightLegs: null,
            },
          ],
        },
      }),
    );

    assert.deepEqual(
      view.dutyPeriods.map((d) => d.id),
      ["old"],
    );
  });

  it("reports no schedule rather than an empty one when nothing is uploaded", () => {
    const view = assemblePilotRosterView(makeInput({ schedule: null }));

    assert.equal(view.hasSchedule, false);
    assert.equal(view.period, null);
    assert.deepEqual(view.dutyPeriods, []);
    assert.equal(view.name, "Test Pilot");
    assert.equal(view.crewId, "12345");
  });
});
