import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromTcddStation, toTcddStation } from "@/lib/trains/data/tcddStations";

describe("tcddStations", () => {
  it("maps the Istanbul–Eskişehir pair CLAUDE.md requires to work", () => {
    assert.deepEqual(toTcddStation("IST"), {
      id: 1325,
      name: "İSTANBUL(SÖĞÜTLÜÇEŞME)",
    });
    assert.deepEqual(toTcddStation("ESK"), { id: 93, name: "ESKİŞEHİR" });
  });

  it("returns null for a code it does not know", () => {
    assert.equal(toTcddStation("XXX"), null);
  });

  it("round-trips a station name back to a CrewRest code", () => {
    assert.equal(fromTcddStation("ESKİŞEHİR"), "ESK");
    assert.equal(fromTcddStation("  eskişehir  "), "ESK");
    assert.equal(fromTcddStation("PARIS NORD"), null);
  });
});
