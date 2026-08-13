/**
 * Pinned before anything builds a date, per CLAUDE.md: this file exercises reachability, which is
 * defined in Türkiye local time, and a bare `new Date` mis-parse is invisible on a UTC+3 host.
 */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { serializeTrainOption } from "@/lib/trains/serialized";
import type { TrainOption } from "@/lib/trains/TrainProvider";
import {
  assembleOffWindowView,
  type OffWindowViewInput,
  type OffWindowViewPilot,
} from "@/lib/views/offWindowView";

/**
 * Duty releases 15 Aug 06:00 and the pilot reports back 17 Aug 12:00, Türkiye local. With the
 * default 90-minute transfer that makes the travel window 07:30 on the 15th to a latest return
 * arrival of 10:30 on the 17th — the two edges every filtering assertion below turns on.
 */
const DUTY_ENDS = buildTurkeyDate(2026, 7, 15, 6, 0);
const REPORT_BACK = buildTurkeyDate(2026, 7, 17, 12, 0);

const PILOT: OffWindowViewPilot = {
  crewId: "12345",
  homeCity: "Eskişehir",
  homeStationCode: "ESK",
  homeStationName: "ESKİŞEHİR",
  airportTransferMinutes: 90,
};

function train(
  trainNumber: string,
  departureAt: Date,
  arrivalAt: Date,
  overrides: Partial<TrainOption> = {},
): TrainOption {
  return {
    trainNumber,
    originCode: "IST",
    destinationCode: "ESK",
    departureAt,
    arrivalAt,
    durationMinutes: Math.round((arrivalAt.getTime() - departureAt.getTime()) / 60_000),
    source: "live",
    ...overrides,
  };
}

function makeInput(overrides: Partial<OffWindowViewInput> = {}): OffWindowViewInput {
  return {
    windowId: "win_1",
    pilot: PILOT,
    offWindow: { startAt: DUTY_ENDS, endAt: REPORT_BACK, travelEligible: true },
    precedingRestEndsAt: null,
    commitment: null,
    destinations: [],
    outboundCandidates: [],
    returnCandidates: [],
    ...overrides,
  };
}

describe("assembleOffWindowView", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect — a naive `new Date` parse would match the correct answer here",
    );
  });

  it("computes the travel window from duty release, not the raw gap", () => {
    const view = assembleOffWindowView(makeInput());

    assert.equal(view.travel.startAt.getTime(), buildTurkeyDate(2026, 7, 15, 7, 30).getTime());
    assert.equal(
      view.travel.latestReturnArrivalAt.getTime(),
      buildTurkeyDate(2026, 7, 17, 10, 30).getTime(),
    );
    assert.equal(view.dutyEndsAt.getTime(), DUTY_ENDS.getTime());
    assert.equal(view.reportBackAt.getTime(), REPORT_BACK.getTime());
  });

  describe("before a home city is set", () => {
    it("offers nothing to choose between and asks for a destination instead", () => {
      // The page branches on homeStationCode to show the picker rather than the planner. With no
      // station there is no search, so the assembler must survive empty candidate lists.
      const view = assembleOffWindowView(
        makeInput({ pilot: { ...PILOT, homeStationCode: null, homeCity: null } }),
      );

      assert.equal(view.homeStationCode, null);
      assert.deepEqual(view.outboundOptions, []);
      assert.deepEqual(view.returnOptions, []);
      assert.equal(view.outboundChoice, null);
      assert.equal(view.initialOutboundIndex, 0);
      assert.equal(view.initialReturnIndex, 0);
    });

    it("falls back through homeCity to the station name to a generic label", () => {
      const named = assembleOffWindowView(makeInput());
      assert.equal(named.homeCity, "Eskişehir");

      const stationOnly = assembleOffWindowView(
        makeInput({ pilot: { ...PILOT, homeCity: null } }),
      );
      assert.equal(stationOnly.homeCity, "ESKİŞEHİR");

      const neither = assembleOffWindowView(
        makeInput({ pilot: { ...PILOT, homeCity: null, homeStationName: null } }),
      );
      assert.equal(neither.homeCity, "home");
    });
  });

  describe("filtering the outbound", () => {
    it("drops departures the feeder metro can't reach", () => {
      const view = assembleOffWindowView(
        makeInput({
          outboundCandidates: [
            train("T1", buildTurkeyDate(2026, 7, 15, 3, 0), buildTurkeyDate(2026, 7, 15, 6, 0)),
            train("T2", buildTurkeyDate(2026, 7, 15, 8, 0), buildTurkeyDate(2026, 7, 15, 11, 0)),
          ],
        }),
      );

      assert.deepEqual(
        view.outboundOptions.map((o) => o.trainNumber),
        ["T2"],
        "a 03:00 departure is between the last metro (01:30) and the first (07:30)",
      );
    });

    it("drops sold-out trains, which are not a way home", () => {
      const view = assembleOffWindowView(
        makeInput({
          outboundCandidates: [
            train("T1", buildTurkeyDate(2026, 7, 15, 8, 0), buildTurkeyDate(2026, 7, 15, 11, 0), {
              isSoldOut: true,
            }),
            train("T2", buildTurkeyDate(2026, 7, 15, 9, 0), buildTurkeyDate(2026, 7, 15, 12, 0)),
          ],
        }),
      );

      assert.deepEqual(
        view.outboundOptions.map((o) => o.trainNumber),
        ["T2"],
      );
    });

    it("keeps trains whose availability the provider never reported", () => {
      // StaticTrainProvider leaves isSoldOut undefined. Treating that as sold out would empty the
      // whole timetable the moment the live provider fails over.
      const view = assembleOffWindowView(
        makeInput({
          outboundCandidates: [
            train("T1", buildTurkeyDate(2026, 7, 15, 8, 0), buildTurkeyDate(2026, 7, 15, 11, 0), {
              source: "estimate",
            }),
          ],
        }),
      );

      assert.equal(view.outboundOptions.length, 1);
    });
  });

  describe("filtering the return", () => {
    const returns = [
      // Arrives 04:00 — before the first metro, so the pilot is stuck at the station.
      train("R1", buildTurkeyDate(2026, 7, 16, 1, 0), buildTurkeyDate(2026, 7, 16, 4, 0)),
      train("R2", buildTurkeyDate(2026, 7, 16, 8, 0), buildTurkeyDate(2026, 7, 16, 11, 0)),
      train("R3", buildTurkeyDate(2026, 7, 17, 6, 0), buildTurkeyDate(2026, 7, 17, 9, 0)),
      // Arrives 12:00 — after the 10:30 deadline to still make report time.
      train("R4", buildTurkeyDate(2026, 7, 17, 9, 0), buildTurkeyDate(2026, 7, 17, 12, 0)),
    ];

    it("drops arrivals that strand the pilot or miss report time", () => {
      const view = assembleOffWindowView(makeInput({ returnCandidates: returns }));

      assert.deepEqual(
        view.returnOptions.map((o) => o.trainNumber),
        ["R2", "R3"],
      );
    });

    it("preselects the latest return that still clears the transfer back", () => {
      const view = assembleOffWindowView(makeInput({ returnCandidates: returns }));

      assert.equal(view.initialReturnIndex, 1);
      assert.equal(view.returnOptions[view.initialReturnIndex].trainNumber, "R3");
    });
  });

  describe("preselecting the outbound", () => {
    it("takes the first departure within the two-hour station wait", () => {
      const view = assembleOffWindowView(
        makeInput({
          outboundCandidates: [
            train("T1", buildTurkeyDate(2026, 7, 15, 8, 0), buildTurkeyDate(2026, 7, 15, 11, 0)),
            train("T2", buildTurkeyDate(2026, 7, 15, 12, 0), buildTurkeyDate(2026, 7, 15, 15, 0)),
          ],
        }),
      );

      assert.equal(view.initialOutboundIndex, 0);
      assert.equal(view.outboundChoice?.waitMinutes, 30);
      assert.equal(view.outboundChoice?.isLongWait, false);
    });

    it("flags a long wait rather than pretending the first train is fine", () => {
      const view = assembleOffWindowView(
        makeInput({
          outboundCandidates: [
            train("T1", buildTurkeyDate(2026, 7, 15, 15, 0), buildTurkeyDate(2026, 7, 15, 18, 0)),
          ],
        }),
      );

      assert.equal(view.outboundChoice?.isLongWait, true);
      assert.equal(view.outboundChoice?.waitMinutes, 450);
      assert.equal(view.initialOutboundIndex, 0, "still offered, just flagged");
    });
  });

  describe("restoring a commitment", () => {
    const outbounds = [
      train("T1", buildTurkeyDate(2026, 7, 15, 8, 0), buildTurkeyDate(2026, 7, 15, 11, 0), {
        providerTrainId: "prov-1",
      }),
      train("T2", buildTurkeyDate(2026, 7, 15, 12, 0), buildTurkeyDate(2026, 7, 15, 15, 0), {
        providerTrainId: "prov-2",
      }),
    ];

    function commitmentTo(option: TrainOption, tweaks: Partial<TrainOption> = {}) {
      return {
        outboundTrain: serializeTrainOption({ ...option, ...tweaks }),
        returnTrain: serializeTrainOption(option),
        bookingReference: null,
      };
    }

    it("matches on the provider's id even when the timetable moved underneath it", () => {
      // Same train, renumbered and retimed since the commitment was made. The departure-time
      // fallback would miss this; the provider id is what survives a timetable edit.
      const view = assembleOffWindowView(
        makeInput({
          outboundCandidates: outbounds,
          commitment: commitmentTo(outbounds[1], {
            trainNumber: "RENAMED",
            departureAt: buildTurkeyDate(2026, 7, 15, 13, 45),
          }),
        }),
      );

      assert.equal(view.initialOutboundIndex, 1);
      assert.equal(view.isCommitted, true);
    });

    it("falls back to train number and departure time when there is no provider id", () => {
      // A commitment made against the curated timetable carries no id.
      const curated = train(
        "T2",
        buildTurkeyDate(2026, 7, 15, 12, 0),
        buildTurkeyDate(2026, 7, 15, 15, 0),
        { source: "estimate" },
      );

      const view = assembleOffWindowView(
        makeInput({
          outboundCandidates: outbounds,
          commitment: commitmentTo(curated),
        }),
      );

      assert.equal(view.initialOutboundIndex, 1);
    });

    it("keeps the computed default when the committed train is no longer offered", () => {
      // A withdrawn or sold-out train drops out of the list between committing and returning.
      // Preselecting nothing at all would be worse than preselecting the sensible default.
      const view = assembleOffWindowView(
        makeInput({
          outboundCandidates: outbounds,
          commitment: commitmentTo(
            train("GONE", buildTurkeyDate(2026, 7, 15, 20, 0), buildTurkeyDate(2026, 7, 15, 23, 0), {
              providerTrainId: "prov-gone",
            }),
          ),
        }),
      );

      assert.equal(view.initialOutboundIndex, 0);
      assert.equal(view.isCommitted, true);
    });

    it("surfaces the PNR as a string, empty when the trip is planned but not ticketed", () => {
      const planned = assembleOffWindowView(
        makeInput({ outboundCandidates: outbounds, commitment: commitmentTo(outbounds[0]) }),
      );
      assert.equal(planned.bookingReference, "");

      const ticketed = assembleOffWindowView(
        makeInput({
          outboundCandidates: outbounds,
          commitment: { ...commitmentTo(outbounds[0]), bookingReference: "1234567890" },
        }),
      );
      assert.equal(ticketed.bookingReference, "1234567890");

      const uncommitted = assembleOffWindowView(makeInput());
      assert.equal(uncommitted.isCommitted, false);
      assert.equal(uncommitted.bookingReference, "");
    });
  });

  describe("minimum rest", () => {
    it("shows rest that runs past duty release, as context only", () => {
      const restEnds = buildTurkeyDate(2026, 7, 15, 18, 0);
      const view = assembleOffWindowView(makeInput({ precedingRestEndsAt: restEnds }));

      assert.equal(view.restEndsAt?.getTime(), restEnds.getTime());
      // DSB constrains when the airline may roster the pilot, never when the pilot may travel.
      assert.equal(view.travel.startAt.getTime(), buildTurkeyDate(2026, 7, 15, 7, 30).getTime());
    });

    it("hides rest that already ended by the time the window opens", () => {
      const view = assembleOffWindowView(
        makeInput({ precedingRestEndsAt: buildTurkeyDate(2026, 7, 15, 5, 0) }),
      );

      assert.equal(view.restEndsAt, null);
    });

    it("hides rest that is absent, as on a day-off block", () => {
      assert.equal(assembleOffWindowView(makeInput()).restEndsAt, null);
    });
  });
});
