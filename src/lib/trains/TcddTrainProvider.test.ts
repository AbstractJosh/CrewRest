process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { TcddTrainProvider } from "@/lib/trains/TcddTrainProvider";

const QUERY_DATE = buildTurkeyDate(2026, 7, 15, 9, 0);

/** A provider whose client call is replaced, so nothing touches the network. */
function providerWith(payload: unknown) {
  let calls = 0;
  const provider = new TcddTrainProvider({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (provider as any).fetchPayload = async () => {
    calls += 1;
    return payload;
  };
  return { provider, calls: () => calls };
}

const PAYLOAD = {
  trainLegs: [
    {
      trainAvailabilities: [
        {
          trains: [
            {
              number: "81034",
              segments: [{ departureTime: 1786764600000, arrivalTime: 1786775100000 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("TcddTrainProvider", () => {
  it("maps what the client returned", async () => {
    const { provider } = providerWith(PAYLOAD);
    const trains = await provider.searchTrains("IST", "ESK", QUERY_DATE);
    assert.equal(trains.length, 1);
    assert.equal(trains[0].trainNumber, "81034");
    assert.equal(trains[0].source, "live");
  });

  it("returns nothing without a request when a station is unmapped", async () => {
    const { provider, calls } = providerWith(PAYLOAD);
    assert.deepEqual(await provider.searchTrains("IST", "XXX", QUERY_DATE), []);
    assert.equal(calls(), 0, "an unmapped station is our gap, not worth a request");
  });

  it("caches per route and Türkiye-local date", async () => {
    // Uses a route distinct from the other tests in this file (IST->ANK rather than IST->ESK):
    // the timetable cache is globalThis-pinned and shared across tests, and reusing IST->ESK here
    // would read the entry the first test already populated for the same Türkiye day.
    const { provider, calls } = providerWith(PAYLOAD);
    await provider.searchTrains("IST", "ANK", QUERY_DATE);
    await provider.searchTrains("IST", "ANK", buildTurkeyDate(2026, 7, 15, 21, 0));
    assert.equal(calls(), 1, "same Türkiye day should hit the cache");

    await provider.searchTrains("IST", "ANK", buildTurkeyDate(2026, 7, 16, 9, 0));
    assert.equal(calls(), 2, "a different day is a different request");
  });

  it("still serves destinations from the curated route list", () => {
    const { provider } = providerWith(PAYLOAD);
    const codes = provider.listDestinationsFromIstanbul().map((s) => s.code);
    assert.ok(codes.includes("ESK"));
  });
});
