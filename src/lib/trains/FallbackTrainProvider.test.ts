import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { FallbackTrainProvider } from "@/lib/trains/FallbackTrainProvider";
import type {
  TrainOption,
  TrainProvider,
  TrainProviderCapabilities,
  TrainStation,
} from "@/lib/trains/TrainProvider";

const DATE = buildTurkeyDate(2026, 7, 15, 0, 0);

const LIVE_CAPABILITIES: TrainProviderCapabilities = {
  liveTimetable: true,
  fares: true,
  seatAvailability: true,
  booking: false,
};

const STATIC_CAPABILITIES: TrainProviderCapabilities = {
  liveTimetable: false,
  fares: false,
  seatAvailability: false,
  booking: false,
};

function option(trainNumber: string, source: "live" | "estimate"): TrainOption {
  return {
    trainNumber,
    originCode: "IST",
    destinationCode: "ESK",
    departureAt: buildTurkeyDate(2026, 7, 15, 9, 0),
    arrivalAt: buildTurkeyDate(2026, 7, 15, 11, 0),
    durationMinutes: 120,
    source,
  };
}

function stubProvider(
  capabilities: TrainProviderCapabilities,
  searchTrains: TrainProvider["searchTrains"],
  destinations: TrainStation[] = [{ code: "ESK", name: "Eskisehir", city: "Eskisehir" }],
): TrainProvider {
  return {
    capabilities,
    listDestinationsFromIstanbul: () => destinations,
    searchTrains,
  };
}

const workingPrimary = () =>
  stubProvider(LIVE_CAPABILITIES, async () => [option("live-1", "live")]);

const failingPrimary = () =>
  stubProvider(LIVE_CAPABILITIES, async () => {
    throw new Error("403 Forbidden");
  });

const staticFallback = () =>
  stubProvider(STATIC_CAPABILITIES, async () => [option("static-1", "estimate")]);

describe("FallbackTrainProvider", () => {
  it("returns the primary's trains when it succeeds", async () => {
    const provider = new FallbackTrainProvider(workingPrimary(), staticFallback());
    const trains = await provider.searchTrains("IST", "ESK", DATE);

    assert.deepEqual(
      trains.map((t) => t.trainNumber),
      ["live-1"],
    );
    assert.equal(trains[0].source, "live");
  });

  it("never calls the fallback while the primary is healthy", async () => {
    const fallbackSearch = mock.fn(async () => [option("static-1", "estimate")]);
    const provider = new FallbackTrainProvider(
      workingPrimary(),
      stubProvider(STATIC_CAPABILITIES, fallbackSearch),
    );

    await provider.searchTrains("IST", "ESK", DATE);
    assert.equal(fallbackSearch.mock.callCount(), 0);
  });

  it("falls back to estimates when the primary throws", async () => {
    mock.method(console, "warn", () => {});
    const provider = new FallbackTrainProvider(failingPrimary(), staticFallback());
    const trains = await provider.searchTrains("IST", "ESK", DATE);

    assert.deepEqual(
      trains.map((t) => t.trainNumber),
      ["static-1"],
    );
    assert.equal(trains[0].source, "estimate");
    mock.restoreAll();
  });

  it("logs a failing primary only once, not on every request", async () => {
    const warn = mock.method(console, "warn", () => {});
    const provider = new FallbackTrainProvider(failingPrimary(), staticFallback());

    await provider.searchTrains("IST", "ESK", DATE);
    await provider.searchTrains("IST", "ESK", DATE);
    await provider.searchTrains("IST", "ESK", DATE);

    assert.equal(warn.mock.callCount(), 1);
    mock.restoreAll();
  });

  it("reports the primary's capabilities", () => {
    const provider = new FallbackTrainProvider(workingPrimary(), staticFallback());
    assert.deepEqual(provider.capabilities, LIVE_CAPABILITIES);
  });

  it("uses the fallback's destinations when the primary lists none", () => {
    const provider = new FallbackTrainProvider(
      stubProvider(LIVE_CAPABILITIES, async () => [], []),
      staticFallback(),
    );
    assert.deepEqual(
      provider.listDestinationsFromIstanbul().map((d) => d.code),
      ["ESK"],
    );
  });
});
