import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { computeTravelWindow } from "@/lib/schedule/travelWindow";

describe("computeTravelWindow", () => {
  // The Aug 1 → Aug 4 gap from the sample roster: duty releases (MS) 01 Aug 23:45, next
  // report (MB) 04 Aug 16:50.
  const gap = {
    startAt: buildTurkeyDate(2026, 7, 1, 23, 45),
    endAt: buildTurkeyDate(2026, 7, 4, 16, 50),
  };

  it("pushes the start out by the transfer time", () => {
    const window = computeTravelWindow(gap, 90);
    assert.equal(
      window.startAt.toISOString(),
      buildTurkeyDate(2026, 7, 2, 1, 15).toISOString(),
    );
  });

  it("leaves report time as a hard deadline", () => {
    const window = computeTravelWindow(gap, 90);
    assert.equal(window.endAt.toISOString(), gap.endAt.toISOString());
    assert.equal(window.minutes, 63 * 60 + 35);
  });

  it("pulls the latest usable return arrival back by the transfer time", () => {
    const window = computeTravelWindow(gap, 90);
    assert.equal(
      window.latestReturnArrivalAt.toISOString(),
      buildTurkeyDate(2026, 7, 4, 15, 20).toISOString(),
    );
  });

  it("tracks the transfer setting", () => {
    assert.equal(computeTravelWindow(gap, 60).minutes, 64 * 60 + 5);
    assert.equal(computeTravelWindow(gap, 0).minutes, 65 * 60 + 5);
  });

  it("reports a gap the buffers swallow as unviable", () => {
    const short = computeTravelWindow(
      {
        startAt: buildTurkeyDate(2026, 7, 1, 10, 0),
        endAt: buildTurkeyDate(2026, 7, 1, 12, 0),
      },
      90,
    );
    assert.equal(short.isViable, false);
  });

  it("treats a gap with room to spare as viable", () => {
    assert.equal(computeTravelWindow(gap, 90).isViable, true);
  });
});
