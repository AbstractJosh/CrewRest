/**
 * Forced before anything parses a date.
 *
 * Every assertion below is about which Türkiye day and which Türkiye wall-clock time the caption
 * names. On a UTC+3 host — which is where this app runs — a mis-derived day is right by accident,
 * so the bug these tests exist to catch would pass unnoticed. Pinning a non-Turkish zone makes it
 * a failure everywhere.
 */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { buildBookingUrl, EBILET_SEARCH_URL } from "@/lib/trains/booking";
import { describeBookingTarget } from "@/lib/trains/bookingTarget";
import { serializeTrainOption } from "@/lib/trains/serialized";
import type { TrainOption } from "@/lib/trains/TrainProvider";

/** A live 14:00 → 16:26 on Saturday 22 Aug 2026, priced like a real one. */
function option(overrides: Partial<TrainOption> = {}) {
  return serializeTrainOption({
    trainNumber: "81034",
    originCode: "IST",
    destinationCode: "ESK",
    departureAt: buildTurkeyDate(2026, 7, 22, 14, 0),
    arrivalAt: buildTurkeyDate(2026, 7, 22, 16, 26),
    durationMinutes: 146,
    source: "live",
    fares: [
      { className: "BUSİNESS", priceMinor: 90000, currency: "TRY" },
      { className: "EKONOMİ", priceMinor: 60000, currency: "TRY" },
    ],
    ...overrides,
  });
}

describe("describeBookingTarget", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect — a naive `new Date` parse would match the correct answer here",
    );
  });

  it("names the day, the times, the train and the cheapest fare for a live option", () => {
    // These four are exactly what ebilet prints on the row: its card headline leads with the
    // train number and its price is the cheapest sellable class.
    assert.equal(
      describeBookingTarget(option()).caption,
      "Opens Sat 22 Aug on ebilet — look for 14:00 → 16:26, train 81034, ₺600,00.",
    );
  });

  it("drops the price when the provider quoted none", () => {
    assert.equal(
      describeBookingTarget(option({ fares: undefined })).caption,
      "Opens Sat 22 Aug on ebilet — look for 14:00 → 16:26, train 81034.",
    );
  });

  it("omits the train number for an estimate and keeps the estimate framing", () => {
    // The curated timetable synthesizes numbers from list position, so naming one would point at
    // a row ebilet does not have. Branching is on `source`, not on the field being absent —
    // hence a train number present on the input here.
    const caption = describeBookingTarget(option({ source: "estimate" })).caption;
    assert.equal(
      caption,
      "Opens Sat 22 Aug on ebilet — 14:00 → 16:26 is an approximate planning estimate, " +
        "not a live feed, so confirm the real departure there.",
    );
    assert.ok(!caption.includes("81034"), "an estimate must not advertise a synthesized number");
  });

  it("captions the next Türkiye day for a past-midnight departure, and the link agrees", () => {
    // The case the caption exists for: 00:40 on the 23rd is 21:40Z on the 22nd, so a window that
    // began on Saturday evening sends the pilot to *Sunday's* list. Deriving the label separately
    // from the URL's date is what would let those two drift apart.
    const pastMidnight = option({
      departureAt: buildTurkeyDate(2026, 7, 23, 0, 40),
      arrivalAt: buildTurkeyDate(2026, 7, 23, 3, 6),
    });

    const caption = describeBookingTarget(pastMidnight).caption;
    assert.ok(
      caption.startsWith("Opens Sun 23 Aug on ebilet"),
      `captioned the wrong day: ${caption}`,
    );
    assert.equal(
      new URL(buildBookingUrl({ ...pastMidnight, departureAt: new Date(pastMidnight.departureAt) }))
        .searchParams.get("gidisTarih"),
      "2026-08-23",
    );
  });

  describe("when the link degraded to the bare search page", () => {
    /*
     * `buildBookingUrl` falls back to the ebilet home page rather than a wrong deep link — an
     * unmapped station, or a template TCDD's format change broke. The caption has to fall back
     * with it: "Opens Sun 23 Aug" over an empty search form is a claim the pilot can only
     * disprove by missing the train.
     */
    it("asks the pilot to search for the day instead of promising it is open", () => {
      const unmapped = option({ originCode: "XXX" });
      assert.equal(unmapped.bookingUrl, EBILET_SEARCH_URL, "precondition: the link degraded");

      assert.equal(
        describeBookingTarget(unmapped).caption,
        "Search ebilet for Sat 22 Aug — look for 14:00 → 16:26, train 81034, ₺600,00.",
      );
    });

    it("does the same for an estimate", () => {
      assert.equal(
        describeBookingTarget(option({ originCode: "XXX", source: "estimate" })).caption,
        "Search ebilet for Sat 22 Aug — 14:00 → 16:26 is an approximate planning estimate, " +
          "not a live feed, so confirm the real departure there.",
      );
    });
  });

  describe("fares TCDD sent that Intl cannot format", () => {
    /*
     * The mapper passes `minPriceCurrency` through as whatever string arrived, and a stored
     * commitment's JSON column is cast unchecked. This caption now renders inside a server
     * component, so a throw here would 500 all of `/plans` — every pilot's plans — over one row.
     */
    it("prints a non-ISO currency verbatim rather than throwing", () => {
      assert.equal(
        describeBookingTarget(
          option({ fares: [{ className: "EKONOMİ", priceMinor: 60000, currency: "TL" }] }),
        ).caption,
        "Opens Sat 22 Aug on ebilet — look for 14:00 → 16:26, train 81034, 600.00 TL.",
      );
    });

    it("drops a fare with no usable price instead of advertising a free ticket", () => {
      // `JSON.stringify(NaN)` is `"null"`, so this is what a round-tripped bad price looks like.
      const unpriced = [
        { className: "EKONOMİ", priceMinor: null as unknown as number, currency: "TRY" },
      ];

      assert.equal(
        describeBookingTarget(option({ fares: unpriced })).caption,
        "Opens Sat 22 Aug on ebilet — look for 14:00 → 16:26, train 81034.",
      );
    });
  });
});
