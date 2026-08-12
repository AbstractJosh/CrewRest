import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { buildBookingUrl, EBILET_SEARCH_URL } from "@/lib/trains/booking";

const OPTION = {
  originCode: "IST",
  destinationCode: "ESK",
  departureAt: buildTurkeyDate(2026, 7, 15, 6, 30),
};

describe("buildBookingUrl", () => {
  it("prefills the trip on ebilet's redirect route by default", () => {
    const url = new URL(buildBookingUrl(OPTION));
    assert.equal(url.pathname, "/sefer-listesi-yonlendirme");
    assert.equal(url.searchParams.get("binisIstasyonId"), "1325");
    assert.equal(url.searchParams.get("inisIstasyonId"), "93");
    assert.equal(url.searchParams.get("gidisTarih"), "2026-08-15");
    assert.equal(url.searchParams.get("yolcuSayisi"), "1");
    // 1 = one way. 0 would be a round trip and read donusTarih as a real date.
    assert.equal(url.searchParams.get("seyahatTuru"), "1");
  });

  it("still sends an empty donusTarih on a one-way trip", () => {
    // Not redundant with the trip above: ebilet JSON.parses donusTarih before it looks at
    // seyahatTuru, so omitting the key entirely throws and bounces the pilot to the home page.
    // Present-but-empty is what makes the one-way link work at all.
    const url = new URL(buildBookingUrl(OPTION));
    assert.ok(url.searchParams.has("donusTarih"));
    assert.equal(url.searchParams.get("donusTarih"), "");
  });

  it("uses the Türkiye-local travel date, not the UTC one", () => {
    // 00:30 on the 15th Türkiye time is 21:30 on the 14th in UTC.
    const url = new URL(
      buildBookingUrl({ ...OPTION, departureAt: buildTurkeyDate(2026, 7, 15, 0, 30) }),
    );
    assert.equal(url.searchParams.get("gidisTarih"), "2026-08-15");
  });

  it("falls back to the plain search page for a station it cannot map", () => {
    assert.equal(buildBookingUrl({ ...OPTION, destinationCode: "XXX" }), EBILET_SEARCH_URL);
  });

  it("honours an override template, ids and names both", () => {
    const url = buildBookingUrl(
      OPTION,
      "https://example.test/?a={fromId}&b={toId}&c={from}&d={date}&e={time}",
    );
    assert.equal(
      url,
      "https://example.test/?a=1325&b=93" +
        "&c=%C4%B0STANBUL(S%C3%96%C4%9E%C3%9CTL%C3%9C%C3%87E%C5%9EME)" +
        "&d=2026-08-15&e=06:30",
    );
  });

  it("falls back to the search page when a template is malformed", () => {
    mock.method(console, "warn", () => {});
    try {
      assert.equal(buildBookingUrl(OPTION, "not a url {fromId}"), EBILET_SEARCH_URL);
    } finally {
      mock.restoreAll();
    }
  });
});
