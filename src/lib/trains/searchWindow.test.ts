import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { searchTrainsInWindow } from "@/lib/trains/searchWindow";
import type { TrainOption, TrainProvider } from "@/lib/trains/TrainProvider";

/**
 * Records which days it was asked about, so the tests can assert on the fan-out itself — the
 * thing that matters against a live endpoint that will rate-limit us.
 */
function recordingProvider(): TrainProvider & { requestedDays: string[] } {
  const requestedDays: string[] = [];
  return {
    requestedDays,
    capabilities: {
      liveTimetable: true,
      fares: false,
      seatAvailability: false,
      booking: false,
    },
    listDestinationsFromIstanbul: () => [],
    async searchTrains(originCode, destinationCode, date): Promise<TrainOption[]> {
      requestedDays.push(date.toISOString());
      // One midday departure per day, comfortably inside any window under test.
      const shifted = new Date(date.getTime() + 3 * 60 * 60_000);
      const departureAt = buildTurkeyDate(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
        12,
        0,
      );
      return [
        {
          trainNumber: `T-${shifted.getUTCDate()}`,
          originCode,
          destinationCode,
          departureAt,
          arrivalAt: new Date(departureAt.getTime() + 2 * 60 * 60_000),
          durationMinutes: 120,
          source: "live",
        },
      ];
    },
  };
}

describe("searchTrainsInWindow", () => {
  it("queries every day the window spans by default", async () => {
    const provider = recordingProvider();
    await searchTrainsInWindow(
      provider,
      "IST",
      "ESK",
      buildTurkeyDate(2026, 7, 1, 8, 0),
      buildTurkeyDate(2026, 7, 5, 20, 0),
    );
    assert.equal(provider.requestedDays.length, 5);
  });

  it("stops at maxDays so a live provider isn't hammered", async () => {
    const provider = recordingProvider();
    await searchTrainsInWindow(
      provider,
      "IST",
      "ESK",
      buildTurkeyDate(2026, 7, 1, 8, 0),
      buildTurkeyDate(2026, 7, 20, 20, 0),
      3,
    );
    assert.equal(provider.requestedDays.length, 3);
  });

  it("never exceeds the hard month cap even when asked to", async () => {
    const provider = recordingProvider();
    await searchTrainsInWindow(
      provider,
      "IST",
      "ESK",
      buildTurkeyDate(2026, 0, 1, 8, 0),
      buildTurkeyDate(2026, 5, 1, 20, 0),
      500,
    );
    assert.equal(provider.requestedDays.length, 31);
  });

  it("returns only trains that fit entirely inside the window, in time order", async () => {
    const provider = recordingProvider();
    const trains = await searchTrainsInWindow(
      provider,
      "IST",
      "ESK",
      // Starts after day 1's 12:00 departure, ends before day 3's 14:00 arrival.
      buildTurkeyDate(2026, 7, 1, 13, 0),
      buildTurkeyDate(2026, 7, 3, 13, 0),
    );

    assert.deepEqual(
      trains.map((t) => t.trainNumber),
      ["T-2"],
    );
  });

  it("returns nothing when the window is inverted", async () => {
    const provider = recordingProvider();
    const trains = await searchTrainsInWindow(
      provider,
      "IST",
      "ESK",
      buildTurkeyDate(2026, 7, 5, 8, 0),
      buildTurkeyDate(2026, 7, 1, 8, 0),
    );

    assert.deepEqual(trains, []);
    assert.equal(provider.requestedDays.length, 0);
  });
});
