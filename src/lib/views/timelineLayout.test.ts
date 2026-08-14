/** Türkiye-local day boundaries are correct by accident on a UTC+3 host. Pin a different zone. */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTimeline } from "@/lib/views/timelineLayout";

describe("buildTimeline", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect",
    );
  });

  it("places a duty inside one day as percentages of that day", () => {
    // 06:00 → 12:00 Türkiye local on 15 Aug = 03:00Z → 09:00Z.
    const days = buildTimeline({
      duties: [
        {
          id: "d1",
          startAt: new Date("2026-08-15T03:00:00Z"),
          endAt: new Date("2026-08-15T09:00:00Z"),
          type: "FLIGHT",
          label: "TK1",
        },
      ],
      windows: [],
    });

    assert.equal(days.length, 1);
    assert.equal(days[0].blocks.length, 1);
    assert.equal(days[0].blocks[0].startPercent, 25);
    assert.equal(days[0].blocks[0].endPercent, 50);
    assert.equal(days[0].blocks[0].continuesBefore, false);
    assert.equal(days[0].blocks[0].continuesAfter, false);
  });

  it("splits a duty that crosses Türkiye midnight into two rows", () => {
    // 18:00 on 15 Aug → 06:00 on 16 Aug, local = 15:00Z → 03:00Z.
    const days = buildTimeline({
      duties: [
        {
          id: "d1",
          startAt: new Date("2026-08-15T15:00:00Z"),
          endAt: new Date("2026-08-16T03:00:00Z"),
          type: "FLIGHT",
          label: "TK1",
        },
      ],
      windows: [],
    });

    assert.equal(days.length, 2);
    assert.equal(days[0].blocks[0].startPercent, 75);
    assert.equal(days[0].blocks[0].endPercent, 100);
    assert.equal(days[0].blocks[0].continuesAfter, true);
    assert.equal(days[1].blocks[0].startPercent, 0);
    assert.equal(days[1].blocks[0].endPercent, 25);
    assert.equal(days[1].blocks[0].continuesBefore, true);
  });

  it("emits a row for a day with no blocks so the axis stays continuous", () => {
    const days = buildTimeline({
      duties: [
        {
          id: "d1",
          startAt: new Date("2026-08-15T03:00:00Z"),
          endAt: new Date("2026-08-15T09:00:00Z"),
          type: "FLIGHT",
          label: "TK1",
        },
        {
          id: "d2",
          startAt: new Date("2026-08-17T03:00:00Z"),
          endAt: new Date("2026-08-17T09:00:00Z"),
          type: "FLIGHT",
          label: "TK2",
        },
      ],
      windows: [],
    });

    assert.equal(days.length, 3);
    assert.deepEqual(days[1].blocks, []);
  });

  it("carries a window's href through and marks it as a window", () => {
    const days = buildTimeline({
      duties: [],
      windows: [
        {
          id: "w1",
          startAt: new Date("2026-08-15T03:00:00Z"),
          endAt: new Date("2026-08-15T09:00:00Z"),
          label: "6h",
          href: "/pilot/abc/window/w1",
        },
      ],
    });

    assert.equal(days[0].blocks[0].kind, "window");
    assert.equal(days[0].blocks[0].href, "/pilot/abc/window/w1");
  });

  it("keeps a duty ending exactly at Türkiye midnight on a single row", () => {
    // 20:00 on 15 Aug Türkiye local → 00:00 on 16 Aug Türkiye local (exact midnight).
    // Türkiye is UTC+3, no DST: 20:00 local = 17:00Z on 15 Aug; 00:00 local on 16 Aug = 21:00Z on 15 Aug.
    const days = buildTimeline({
      duties: [
        {
          id: "d1",
          startAt: new Date("2026-08-15T17:00:00Z"),
          endAt: new Date("2026-08-15T21:00:00Z"),
          type: "FLIGHT",
          label: "TK1",
        },
      ],
      windows: [],
    });

    assert.equal(days.length, 1);
    assert.equal(days[0].blocks.length, 1);
    assert.equal(days[0].blocks[0].endPercent, 100);
    assert.equal(days[0].blocks[0].continuesAfter, false);
  });

  it("drops a zero-length span rather than emitting a zero-width block", () => {
    const instant = new Date("2026-08-15T03:00:00Z");
    const days = buildTimeline({
      duties: [{ id: "d1", startAt: instant, endAt: instant, type: "FLIGHT", label: "TK1" }],
      windows: [],
    });

    assert.deepEqual(days, []);
  });
});
