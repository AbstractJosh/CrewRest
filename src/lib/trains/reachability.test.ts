import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import type { TrainOption } from "@/lib/trains/TrainProvider";
import {
  chooseOutbound,
  isAlightable,
  isBoardable,
  MAX_STATION_WAIT_MINUTES,
} from "@/lib/trains/reachability";

/** A Türkiye-local time on an arbitrary fixed day. */
const at = (hour: number, minute: number) => buildTurkeyDate(2026, 7, 3, hour, minute);

const train = (hour: number, minute: number): TrainOption => ({
  trainNumber: `T${hour}${minute}`,
  originCode: "IST",
  destinationCode: "ANK",
  departureAt: at(hour, minute),
  arrivalAt: at(hour + 4, minute),
  durationMinutes: 270,
  source: "estimate",
});

describe("isBoardable", () => {
  it("rejects departures before the metro can get you there", () => {
    assert.equal(isBoardable(at(6, 15)), false);
    assert.equal(isBoardable(at(7, 15)), false);
  });

  it("accepts the 07:30 boundary and the rest of the day", () => {
    assert.equal(isBoardable(at(7, 30)), true);
    assert.equal(isBoardable(at(13, 0)), true);
    assert.equal(isBoardable(at(23, 59)), true);
  });

  it("wraps past midnight to the 01:30 last boarding", () => {
    assert.equal(isBoardable(at(0, 30)), true);
    assert.equal(isBoardable(at(1, 30)), true);
  });

  it("rejects the dead zone between last boarding and first metro", () => {
    assert.equal(isBoardable(at(2, 0)), false);
    assert.equal(isBoardable(at(5, 0)), false);
  });
});

describe("isAlightable", () => {
  it("rejects arrivals before the metro starts running", () => {
    assert.equal(isAlightable(at(3, 0)), false);
  });

  it("accepts arrivals from 06:00 onward", () => {
    assert.equal(isAlightable(at(6, 0)), true);
    assert.equal(isAlightable(at(22, 0)), true);
  });
});

describe("chooseOutbound", () => {
  it("returns null when there is nothing to choose from", () => {
    assert.equal(chooseOutbound([], at(7, 0)), null);
  });

  it("takes the earliest train within the maximum station wait", () => {
    const choice = chooseOutbound([train(8, 0), train(10, 0)], at(7, 0));
    assert.equal(choice?.index, 0);
    assert.equal(choice?.waitMinutes, 60);
    assert.equal(choice?.isLongWait, false);
  });

  it("skips a train that has already departed", () => {
    assert.equal(chooseOutbound([train(6, 0), train(9, 0)], at(7, 30))?.index, 1);
  });

  it("flags a wait longer than the maximum rather than pretending it fits", () => {
    const choice = chooseOutbound([train(14, 0)], at(7, 0));
    assert.equal(choice?.isLongWait, true);
    assert.equal(choice?.waitMinutes, 7 * 60);
  });

  it("keeps the documented two-hour maximum", () => {
    assert.equal(MAX_STATION_WAIT_MINUTES, 120);
  });
});
