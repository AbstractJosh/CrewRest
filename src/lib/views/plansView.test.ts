/**
 * Pinned before anything builds a date, per CLAUDE.md: the card titles are Türkiye-local ranges
 * and a bare `new Date` mis-parse is invisible on a UTC+3 host.
 */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { serializeTrainOption } from "@/lib/trains/serialized";
import type { TrainDataSource } from "@/lib/trains/TrainProvider";
import {
  assemblePlansView,
  type PlanCommitmentInput,
  type PlansViewInput,
} from "@/lib/views/plansView";

const NOW = buildTurkeyDate(2026, 7, 15, 12, 0);

const STATION_NAMES = { IST: "Istanbul", ESK: "Eskisehir" };

function leg(
  originCode: string,
  destinationCode: string,
  departureAt: Date,
  arrivalAt: Date,
  source: TrainDataSource = "live",
) {
  return serializeTrainOption({
    trainNumber: "T1",
    originCode,
    destinationCode,
    departureAt,
    arrivalAt,
    durationMinutes: Math.round((arrivalAt.getTime() - departureAt.getTime()) / 60_000),
    source,
  });
}

/** A plan departing on `day` August and reporting back two days later at 12:00. */
function plan(
  windowId: string,
  day: number,
  overrides: Partial<PlanCommitmentInput> = {},
): PlanCommitmentInput {
  return {
    windowId,
    crewId: "12345",
    pilotName: "Test Pilot",
    tripName: null,
    notes: null,
    bookingReference: null,
    cancelledAt: null,
    windowEndAt: buildTurkeyDate(2026, 7, day + 2, 12, 0),
    outboundTrain: leg(
      "IST",
      "ESK",
      buildTurkeyDate(2026, 7, day, 8, 0),
      buildTurkeyDate(2026, 7, day, 11, 0),
    ),
    returnTrain: leg(
      "ESK",
      "IST",
      buildTurkeyDate(2026, 7, day + 2, 6, 0),
      buildTurkeyDate(2026, 7, day + 2, 9, 0),
    ),
    ...overrides,
  };
}

function makeInput(overrides: Partial<PlansViewInput> = {}): PlansViewInput {
  return { now: NOW, stationNames: STATION_NAMES, commitments: [], ...overrides };
}

describe("assemblePlansView", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect",
    );
  });

  describe("grouping", () => {
    it("splits on whether the pilot is already due back", () => {
      const view = assemblePlansView(
        makeInput({ commitments: [plan("future", 20), plan("done", 1)] }),
      );

      assert.deepEqual(view.upcoming.map((p) => p.windowId), ["future"]);
      assert.deepEqual(view.past.map((p) => p.windowId), ["done"]);
      assert.deepEqual(view.cancelled, []);
    });

    it("counts a window ending exactly now as still upcoming", () => {
      // The boundary is "already due back", so equality is not yet past.
      const ending = plan("edge", 13, { windowEndAt: NOW });
      const view = assemblePlansView(makeInput({ commitments: [ending] }));

      assert.deepEqual(view.upcoming.map((p) => p.windowId), ["edge"]);
      assert.deepEqual(view.past, []);
    });

    it("puts a cancelled plan in Cancelled whatever its dates say", () => {
      const view = assemblePlansView(
        makeInput({
          commitments: [
            plan("dropped", 20, { cancelledAt: buildTurkeyDate(2026, 7, 14, 9, 0) }),
          ],
        }),
      );

      assert.deepEqual(view.cancelled.map((p) => p.windowId), ["dropped"]);
      assert.deepEqual(view.upcoming, []);
      assert.equal(view.cancelled[0].isCancelled, true);
    });

    it("returns three empty groups for no commitments at all", () => {
      const view = assemblePlansView(makeInput());

      assert.deepEqual(view.upcoming, []);
      assert.deepEqual(view.past, []);
      assert.deepEqual(view.cancelled, []);
      assert.equal(view.totalCount, 0);
    });
  });

  describe("ordering", () => {
    it("puts the soonest trip first in Upcoming and the most recent first in Past", () => {
      const view = assemblePlansView(
        makeInput({
          commitments: [
            plan("later", 25),
            plan("sooner", 18),
            plan("older", 1),
            plan("recent", 10),
          ],
        }),
      );

      assert.deepEqual(view.upcoming.map((p) => p.windowId), ["sooner", "later"]);
      assert.deepEqual(view.past.map((p) => p.windowId), ["recent", "older"]);
    });

    it("puts the most recent first in Cancelled too", () => {
      const dropped = buildTurkeyDate(2026, 7, 14, 9, 0);
      const view = assemblePlansView(
        makeInput({
          commitments: [
            plan("old", 2, { cancelledAt: dropped }),
            plan("new", 25, { cancelledAt: dropped }),
          ],
        }),
      );

      assert.deepEqual(view.cancelled.map((p) => p.windowId), ["new", "old"]);
    });
  });

  describe("the card", () => {
    it("titles a plan by its name, falling back to the trip's own dates", () => {
      const view = assemblePlansView(
        makeInput({
          commitments: [plan("named", 20, { tripName: "Vacation" }), plan("unnamed", 22)],
        }),
      );

      assert.equal(view.upcoming[0].title, "Vacation");
      // Outbound departure through return arrival — the trip, not the off-window.
      assert.equal(view.upcoming[1].title, "22 Aug 08:00 → 24 Aug 09:00");
    });

    it("is ticketed only once a booking reference exists", () => {
      const view = assemblePlansView(
        makeInput({
          commitments: [
            plan("ticketed", 20, { bookingReference: "1234567890" }),
            plan("planned", 22),
          ],
        }),
      );

      assert.equal(view.upcoming[0].isTicketed, true);
      assert.equal(view.upcoming[1].isTicketed, false);
    });

    it("resolves station codes to names and falls back to the code when unmapped", () => {
      const unmapped = plan("odd", 20, {
        outboundTrain: leg(
          "IST",
          "ZZZ",
          buildTurkeyDate(2026, 7, 20, 8, 0),
          buildTurkeyDate(2026, 7, 20, 11, 0),
        ),
      });
      const view = assemblePlansView(
        makeInput({ commitments: [plan("normal", 18), unmapped] }),
      );

      assert.equal(view.upcoming[0].originLabel, "Istanbul");
      assert.equal(view.upcoming[0].destinationLabel, "Eskisehir");
      assert.equal(view.upcoming[1].destinationLabel, "ZZZ", "unmapped code shown, not blank");
    });

    it("flags a plan whose stored times came from the curated timetable", () => {
      const estimated = plan("est", 20, {
        returnTrain: leg(
          "ESK",
          "IST",
          buildTurkeyDate(2026, 7, 22, 6, 0),
          buildTurkeyDate(2026, 7, 22, 9, 0),
          "estimate",
        ),
      });
      const view = assemblePlansView(
        makeInput({ commitments: [estimated, plan("live", 18)] }),
      );

      assert.equal(view.upcoming[1].hasEstimates, true, "one estimated leg is enough");
      assert.equal(view.upcoming[0].hasEstimates, false);
    });

    it("flags an estimate on the outbound leg alone, not just the return", () => {
      const estimated = plan("est-out", 20, {
        outboundTrain: leg(
          "IST",
          "ESK",
          buildTurkeyDate(2026, 7, 20, 8, 0),
          buildTurkeyDate(2026, 7, 20, 11, 0),
          "estimate",
        ),
      });
      const view = assemblePlansView(
        makeInput({ commitments: [estimated, plan("live", 18)] }),
      );

      assert.equal(view.upcoming[1].hasEstimates, true, "outbound estimate is enough on its own");
      assert.equal(view.upcoming[0].hasEstimates, false);
    });

    it("carries notes through unchanged, including interior line breaks", () => {
      const withNotes = plan("noted", 20, { notes: "Meet Ali\n\nBring the paperwork" });
      const withoutNotes = plan("bare", 22, { notes: null });
      const view = assemblePlansView(
        makeInput({ commitments: [withNotes, withoutNotes] }),
      );

      assert.equal(view.upcoming[0].notes, "Meet Ali\n\nBring the paperwork");
      assert.equal(view.upcoming[1].notes, null);
    });

    it("links to the window planner for that pilot", () => {
      const view = assemblePlansView(makeInput({ commitments: [plan("w1", 20)] }));

      assert.equal(view.upcoming[0].href, "/pilot/12345/window/w1");
    });
  });

  describe("pilot attribution", () => {
    it("is suppressed for a single pilot and shown once there are two", () => {
      const one = assemblePlansView(makeInput({ commitments: [plan("a", 20), plan("b", 22)] }));
      assert.equal(one.showPilot, false);

      const two = assemblePlansView(
        makeInput({
          commitments: [plan("a", 20), plan("b", 22, { crewId: "99999", pilotName: "Other" })],
        }),
      );
      assert.equal(two.showPilot, true);
    });
  });
});
