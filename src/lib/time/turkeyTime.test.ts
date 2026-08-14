/**
 * Forced before anything parses a date. Turkey-local derivations are correct by accident on a
 * UTC+3 host, so without a non-Türkiye pin these assertions could pass vacuously.
 */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { turkeyMidnight } from "@/lib/time/turkeyTime";

describe("turkeyMidnight", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect — a naive `new Date` parse would match the correct answer here",
    );
  });

  it("returns 21:00Z the previous day, which is Türkiye midnight", () => {
    assert.equal(
      turkeyMidnight(new Date("2026-08-15T10:00:00Z")).toISOString(),
      "2026-08-14T21:00:00.000Z",
    );
  });

  it("is idempotent — midnight of a midnight is the same instant", () => {
    const midnight = turkeyMidnight(new Date("2026-08-15T10:00:00Z"));
    assert.equal(turkeyMidnight(midnight).getTime(), midnight.getTime());
  });

  it("keeps an instant that is late evening UTC on the following Türkiye day", () => {
    // 22:30Z on the 15th is 01:30 on the 16th in Türkiye, so its midnight is the 16th's.
    assert.equal(
      turkeyMidnight(new Date("2026-08-15T22:30:00Z")).toISOString(),
      "2026-08-15T21:00:00.000Z",
    );
  });

  it("does not shift across a month boundary", () => {
    assert.equal(
      turkeyMidnight(new Date("2026-09-01T00:30:00Z")).toISOString(),
      "2026-08-31T21:00:00.000Z",
    );
  });
});
