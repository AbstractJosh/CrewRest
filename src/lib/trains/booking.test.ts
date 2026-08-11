import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { EBILET_SEARCH_URL, buildBookingUrl } from "@/lib/trains/booking";

const TRAIN = {
  originCode: "IST",
  destinationCode: "ESK",
  // 00:30 Türkiye local on 16 Aug — 21:30 UTC on the 15th. The link must carry the day the pilot
  // actually travels, not the UTC one.
  departureAt: buildTurkeyDate(2026, 7, 16, 0, 30),
};

const TEMPLATE = "https://ebilet.tcddtasimacilik.gov.tr/?from={from}&to={to}&date={date}";

describe("buildBookingUrl", () => {
  it("falls back to the plain search page when no template is configured", () => {
    assert.equal(buildBookingUrl(TRAIN, undefined), EBILET_SEARCH_URL);
  });

  it("fills a configured template with URL-encoded station ids", () => {
    const url = new URL(buildBookingUrl(TRAIN, TEMPLATE));
    assert.equal(url.searchParams.get("from"), "İSTANBUL(SÖĞÜTLÜÇEŞME)");
    assert.equal(url.searchParams.get("to"), "ESKİŞEHİR");
  });

  it("uses the Türkiye travel date, not the UTC one", () => {
    const url = new URL(buildBookingUrl(TRAIN, TEMPLATE));
    assert.equal(url.searchParams.get("date"), "2026-08-16");
  });

  it("substitutes the departure time when the template asks for it", () => {
    const url = new URL(buildBookingUrl(TRAIN, `${TEMPLATE}&time={time}`));
    assert.equal(url.searchParams.get("time"), "00:30");
  });

  it("falls back rather than linking to the wrong route for an unmapped station", () => {
    assert.equal(
      buildBookingUrl({ ...TRAIN, destinationCode: "ZZZ" }, TEMPLATE),
      EBILET_SEARCH_URL,
    );
  });

  it("falls back when the template doesn't produce a valid URL", () => {
    mock.method(console, "warn", () => {});
    assert.equal(buildBookingUrl(TRAIN, "not a url {from}"), EBILET_SEARCH_URL);
    mock.restoreAll();
  });
});
