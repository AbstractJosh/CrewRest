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

import { readFileSync } from "node:fs";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), "utf8"),
  );
}

describe("mapTcddResponse", () => {
  const outbound = () => mapTcddResponse(fixture("tcdd-ist-esk"), MAP_OPTIONS);

  it("reads every train out of the trainLegs → trainAvailabilities → trains nesting", () => {
    assert.deepEqual(
      outbound().map((t) => t.trainNumber),
      ["81034", "81030", "12002"],
    );
  });

  it("takes departure from the first segment and arrival from the last", () => {
    const [train] = outbound();
    // 06:30 → 09:25 Türkiye local on 2026-08-15. Reading segments[0].arrivalTime instead would
    // give 06:56 — arrival at the first intermediate stop, not at Eskişehir.
    assert.equal(train.departureAt.toISOString(), "2026-08-15T03:30:00.000Z");
    assert.equal(train.arrivalAt.toISOString(), "2026-08-15T06:25:00.000Z");
    assert.equal(train.durationMinutes, 175);
  });

  it("carries the route and provenance through", () => {
    const [train] = outbound();
    assert.equal(train.originCode, "IST");
    assert.equal(train.destinationCode, "ESK");
    assert.equal(train.source, "live");
    assert.equal(train.providerTrainId, "191862");
  });

  it("maps one fare per cabin class, priced in kuruş", () => {
    const [train] = outbound();
    const business = train.fares?.find((f) => f.code === "C");
    const economy = train.fares?.find((f) => f.code === "Y1");

    assert.equal(business?.className, "BUSİNESS");
    assert.equal(business?.priceMinor, 90000);
    assert.equal(business?.currency, "TRY");
    assert.equal(business?.availableSeats, 12);
    assert.equal(economy?.availableSeats, 133);
  });

  it("leaves wheelchair spaces out of the fare list, not just the seat count", () => {
    // Otherwise the DSB fare reaches `cheapestFare` in TripPlanner and can become the headline
    // price on a train the pilot cannot board. It ties with Y1 at 60000 in these fixtures, so the
    // symptom only shows on a day where DSB is cheaper — assert the exclusion, not the total.
    const [train] = outbound();
    assert.deepEqual(
      train.fares?.map((f) => f.code),
      ["C", "Y1"],
    );
  });

  it("drops the fare list entirely when every priced cabin is excluded", () => {
    // 81030 has DSB as its only priced fare. `isSoldOut: true` alongside a price would be a
    // contradiction the UI has no honest way to render, so the field should be absent.
    const soldOut = outbound().find((t) => t.trainNumber === "81030");
    assert.equal(soldOut?.fares, undefined);
  });

  it("takes the cheapest price when a cabin appears in more than one fare family", () => {
    // Every fixture train has exactly one `availableFareInfo` family, so the collision this
    // guards against needs a synthetic payload.
    const payload = {
      trainLegs: [
        {
          trainAvailabilities: [
            {
              trains: [
                {
                  number: "two families",
                  segments: [{ departureTime: 1786764600000, arrivalTime: 1786775100000 }],
                  availableFareInfo: [
                    {
                      cabinClasses: [
                        {
                          cabinClass: { code: "Y1", name: "EKONOMİ" },
                          minPrice: 750,
                          availabilityCount: 20,
                        },
                      ],
                    },
                    {
                      cabinClasses: [
                        {
                          cabinClass: { code: "Y1", name: "EKONOMİ" },
                          minPrice: 500,
                          availabilityCount: 4,
                        },
                        {
                          cabinClass: { code: "C", name: "BUSİNESS" },
                          minPrice: 900,
                          availabilityCount: 3,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const [train] = mapTcddResponse(payload, MAP_OPTIONS);
    const economy = train.fares?.find((f) => f.code === "Y1");
    assert.equal(train.fares?.length, 2);
    assert.equal(economy?.priceMinor, 50000);
    // The cheaper family's own count comes with it, not the dearer one's.
    assert.equal(economy?.availableSeats, 4);
  });

  it("drops a connecting itinerary rather than presenting its legs as through-services", () => {
    // A connection's second leg would be stamped with the *search's* origin and destination, so
    // it would advertise the connection time as a through-service departure. Both fixtures are
    // all-direct, so this case only exists synthetically.
    const payload = {
      trainLegs: [
        {
          trainAvailabilities: [
            {
              connection: false,
              trains: [
                {
                  number: "direct",
                  segments: [{ departureTime: 1786764600000, arrivalTime: 1786775100000 }],
                },
              ],
            },
            {
              connection: true,
              trains: [
                {
                  number: "leg one",
                  segments: [{ departureTime: 1786768200000, arrivalTime: 1786773000000 }],
                },
                {
                  number: "leg two",
                  segments: [{ departureTime: 1786775000000, arrivalTime: 1786782000000 }],
                },
              ],
            },
          ],
        },
      ],
    };

    assert.deepEqual(
      mapTcddResponse(payload, MAP_OPTIONS).map((t) => t.trainNumber),
      ["direct"],
    );
  });

  it("drops a multi-train itinerary even when TCDD omits the connection flag", () => {
    const payload = {
      trainLegs: [
        {
          trainAvailabilities: [
            {
              trains: [
                {
                  number: "leg one",
                  segments: [{ departureTime: 1786764600000, arrivalTime: 1786775100000 }],
                },
                {
                  number: "leg two",
                  segments: [{ departureTime: 1786775100000, arrivalTime: 1786782000000 }],
                },
              ],
            },
          ],
        },
      ],
    };

    assert.deepEqual(mapTcddResponse(payload, MAP_OPTIONS), []);
  });

  it("counts bookable seats and ignores wheelchair spaces", () => {
    const [train] = outbound();
    // C 12 + Y1 133 = 145. The DSB 2 is not a seat this pilot can buy.
    assert.equal(train.availableSeats, 145);
    assert.equal(train.isSoldOut, false);
  });

  it("treats a train with only wheelchair spaces left as sold out", () => {
    const soldOut = outbound().find((t) => t.trainNumber === "81030");
    assert.equal(soldOut?.availableSeats, 0);
    assert.equal(soldOut?.isSoldOut, true);
  });

  it("keeps an overnight service on the right side of midnight", () => {
    const overnight = outbound().find((t) => t.trainNumber === "12002");
    // 22:47 on the 15th → 03:19 on the 16th, Türkiye local.
    assert.equal(overnight?.departureAt.toISOString(), "2026-08-15T19:47:00.000Z");
    assert.equal(overnight?.arrivalAt.toISOString(), "2026-08-16T00:19:00.000Z");
    assert.equal(overnight?.durationMinutes, 272);
  });

  it("counts a sleeper berth as bookable", () => {
    const trains = mapTcddResponse(fixture("tcdd-esk-ist"), {
      originCode: "ESK",
      destinationCode: "IST",
      date: QUERY_DATE,
    });
    const sleeper = trains.find((t) => t.trainNumber === "22001");
    // Y1 153 + B 8. Cabin class B is YATAKLI, a berth the pilot can absolutely book.
    assert.equal(sleeper?.availableSeats, 161);
    assert.equal(sleeper?.fares?.some((f) => f.code === "B"), true);
  });

  it("handles a train with only two segments", () => {
    const trains = mapTcddResponse(fixture("tcdd-esk-ist"), {
      originCode: "ESK",
      destinationCode: "IST",
      date: QUERY_DATE,
    });
    const short = trains.find((t) => t.trainNumber === "81001");
    assert.equal(short?.departureAt.toISOString(), "2026-08-15T04:18:00.000Z");
    assert.equal(short?.arrivalAt.toISOString(), "2026-08-15T07:07:00.000Z");
  });

  it("returns departures in time order", () => {
    const times = outbound().map((t) => t.departureAt.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  it("drops unreadable rows rather than losing the whole day", () => {
    // One train per availability, as TCDD sends it — an availability is an itinerary, and one
    // carrying several trains is a connection this mapper drops outright.
    const payload = {
      trainLegs: [
        {
          trainAvailabilities: [
            { trains: [{ number: "no segments" }] },
            { trains: [{ number: "empty segments", segments: [] }] },
            {
              trains: [
                {
                  number: "fine",
                  segments: [
                    { departureTime: 1786764600000, arrivalTime: 1786775100000 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    assert.deepEqual(
      mapTcddResponse(payload, MAP_OPTIONS).map((t) => t.trainNumber),
      ["fine"],
    );
  });

  it("returns nothing for a payload that isn't an availability response", () => {
    assert.deepEqual(mapTcddResponse({ error: "rate limited" }, MAP_OPTIONS), []);
    assert.deepEqual(mapTcddResponse(null, MAP_OPTIONS), []);
    assert.deepEqual(mapTcddResponse("<html>go away</html>", MAP_OPTIONS), []);
    assert.deepEqual(mapTcddResponse({ trainLegs: "nope" }, MAP_OPTIONS), []);
  });

  it("leaves seat and fare data undefined when the payload carries none", () => {
    const payload = {
      trainLegs: [
        {
          trainAvailabilities: [
            {
              trains: [
                {
                  number: "bare",
                  segments: [{ departureTime: 1786764600000, arrivalTime: 1786775100000 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const [train] = mapTcddResponse(payload, MAP_OPTIONS);
    assert.equal(train.fares, undefined);
    assert.equal(train.availableSeats, undefined);
    assert.equal(train.isSoldOut, undefined);
  });
});
