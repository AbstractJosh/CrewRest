/**
 * Forced before anything parses a date.
 *
 * A zoneless TCDD timestamp read with bare `new Date()` lands correctly on a host already at
 * UTC+3 — which is exactly where this app runs — so on such a machine the bug these tests exist
 * to catch would pass unnoticed. Pinning a non-Turkish zone makes the mis-parse a failure
 * everywhere, regardless of where the tests happen to run.
 */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { mapTcddResponse, parseTcddInstant } from "@/lib/trains/tcddResponse";

/** The day these fixtures are queried for. */
const QUERY_DATE = buildTurkeyDate(2026, 7, 15, 0, 0);

const MAP_OPTIONS = {
  originCode: "IST",
  destinationCode: "ESK",
  date: QUERY_DATE,
};

describe("parseTcddInstant", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect — a naive `new Date` parse would match the correct answer here",
    );
  });

  /**
   * The whole integration turns on this. TCDD reports Türkiye wall-clock time with no zone, and
   * `new Date("2026-08-15T07:30:00")` reads that in the *host's* zone — so on any machine that
   * isn't at UTC+3 every train silently shifts, while still looking like a plausible timetable.
   * These assertions are written against a fixed instant so they fail on a mis-parse regardless
   * of where the test runs; `npm test` pins TZ to a non-Turkish zone to prove it.
   */
  it("reads a zoneless datetime as Türkiye local, not host local", () => {
    const parsed = parseTcddInstant("2026-08-15T07:30:00", QUERY_DATE);
    assert.equal(parsed?.toISOString(), "2026-08-15T04:30:00.000Z");
  });

  it("accepts a space separator", () => {
    const parsed = parseTcddInstant("2026-08-15 21:45", QUERY_DATE);
    assert.equal(parsed?.toISOString(), "2026-08-15T18:45:00.000Z");
  });

  it("trusts a string that carries its own offset", () => {
    const parsed = parseTcddInstant("2026-08-15T07:30:00+03:00", QUERY_DATE);
    assert.equal(parsed?.toISOString(), "2026-08-15T04:30:00.000Z");
  });

  it("trusts an explicit UTC designator rather than re-shifting it", () => {
    const parsed = parseTcddInstant("2026-08-15T04:30:00Z", QUERY_DATE);
    assert.equal(parsed?.toISOString(), "2026-08-15T04:30:00.000Z");
  });

  it("puts a bare HH:MM on the queried Türkiye day", () => {
    const parsed = parseTcddInstant("07:30", QUERY_DATE);
    assert.equal(parsed?.toISOString(), "2026-08-15T04:30:00.000Z");
  });

  it("handles epoch values in both seconds and milliseconds", () => {
    const ms = Date.UTC(2026, 7, 15, 4, 30);
    assert.equal(parseTcddInstant(ms, QUERY_DATE)?.toISOString(), "2026-08-15T04:30:00.000Z");
    assert.equal(
      parseTcddInstant(ms / 1000, QUERY_DATE)?.toISOString(),
      "2026-08-15T04:30:00.000Z",
    );
  });

  it("returns null for anything it cannot read", () => {
    assert.equal(parseTcddInstant("", QUERY_DATE), null);
    assert.equal(parseTcddInstant("tomorrow morning", QUERY_DATE), null);
    assert.equal(parseTcddInstant(null, QUERY_DATE), null);
    assert.equal(parseTcddInstant({ hour: 7 }, QUERY_DATE), null);
  });
});

describe("mapTcddResponse", () => {
  it("maps a nested payload with fares and seat counts", () => {
    const payload = {
      data: {
        trains: [
          {
            id: "seq-9001",
            trainNumber: "YHT 32002",
            departureTime: "2026-08-15T07:30:00",
            arrivalTime: "2026-08-15T09:35:00",
            fares: [
              { className: "Ekonomi", price: "450,50", availableSeats: 42 },
              { className: "Business", price: "780,00", availableSeats: 3 },
            ],
          },
        ],
      },
    };

    const [train] = mapTcddResponse(payload, MAP_OPTIONS);

    assert.equal(train.trainNumber, "YHT 32002");
    assert.equal(train.providerTrainId, "seq-9001");
    assert.equal(train.source, "live");
    assert.equal(train.originCode, "IST");
    assert.equal(train.destinationCode, "ESK");
    assert.equal(train.durationMinutes, 125);
    // Turkish decimal comma, stored as kuruş.
    assert.equal(train.fares?.[0].priceMinor, 45050);
    assert.equal(train.fares?.[0].currency, "TRY");
    assert.equal(train.availableSeats, 45);
    assert.equal(train.isSoldOut, false);
  });

  it("reads a bare array payload and Turkish field names", () => {
    const payload = [
      { trenAdi: "YHT 12345", kalkis: "13:00", varis: "15:05", bosYerSayisi: 12 },
    ];

    const [train] = mapTcddResponse(payload, MAP_OPTIONS);

    assert.equal(train.trainNumber, "YHT 12345");
    assert.equal(train.departureAt.toISOString(), "2026-08-15T10:00:00.000Z");
    assert.equal(train.durationMinutes, 125);
    assert.equal(train.availableSeats, 12);
  });

  it("rolls an overnight service into the next day", () => {
    const payload = [{ trainNumber: "YHT night", kalkis: "23:30", varis: "01:35" }];

    const [train] = mapTcddResponse(payload, MAP_OPTIONS);

    assert.equal(train.departureAt.toISOString(), "2026-08-15T20:30:00.000Z");
    assert.equal(train.arrivalAt.toISOString(), "2026-08-15T22:35:00.000Z");
    assert.equal(train.durationMinutes, 125);
  });

  it("marks a train with no seats as sold out", () => {
    const payload = [
      { trainNumber: "YHT full", kalkis: "09:00", varis: "11:00", availableSeats: 0 },
    ];
    assert.equal(mapTcddResponse(payload, MAP_OPTIONS)[0].isSoldOut, true);
  });

  it("prefers an explicit sold-out flag over the seat count", () => {
    const payload = [
      { trainNumber: "YHT held", kalkis: "09:00", varis: "11:00", availableSeats: 5, soldOut: true },
    ];
    assert.equal(mapTcddResponse(payload, MAP_OPTIONS)[0].isSoldOut, true);
  });

  it("drops unreadable rows rather than losing the whole day", () => {
    const payload = {
      trains: [
        { trainNumber: "good", kalkis: "09:00", varis: "11:00" },
        { trainNumber: "no times" },
        { trainNumber: "also good", kalkis: "13:00", varis: "15:00" },
      ],
    };

    const trains = mapTcddResponse(payload, MAP_OPTIONS);
    assert.deepEqual(
      trains.map((t) => t.trainNumber),
      ["good", "also good"],
    );
  });

  it("returns departures in time order", () => {
    const payload = [
      { trainNumber: "late", kalkis: "18:00", varis: "20:00" },
      { trainNumber: "early", kalkis: "07:30", varis: "09:30" },
    ];

    assert.deepEqual(
      mapTcddResponse(payload, MAP_OPTIONS).map((t) => t.trainNumber),
      ["early", "late"],
    );
  });

  it("returns nothing for a payload with no recognisable trains", () => {
    assert.deepEqual(mapTcddResponse({ error: "rate limited" }, MAP_OPTIONS), []);
    assert.deepEqual(mapTcddResponse(null, MAP_OPTIONS), []);
    assert.deepEqual(mapTcddResponse("<html>go away</html>", MAP_OPTIONS), []);
  });

  it("leaves fares undefined when the payload carries no prices", () => {
    const [train] = mapTcddResponse(
      [{ trainNumber: "YHT bare", kalkis: "09:00", varis: "11:00" }],
      MAP_OPTIONS,
    );
    assert.equal(train.fares, undefined);
    assert.equal(train.availableSeats, undefined);
    assert.equal(train.isSoldOut, undefined);
  });
});
