/**
 * Bridges CrewRest's own station codes to whatever TCDD calls the same stations.
 *
 * CrewRest's codes (`IST`, `ESK`, …) are already persisted in `Pilot.homeStationCode`, so they
 * can't be replaced with TCDD's ids without a data migration — and TCDD's ids are exactly the
 * kind of thing an unofficial API might change under us. Mapping at the edge keeps the stored
 * codes stable and confines the churn to this file.
 *
 * Per CLAUDE.md the route that has to work today is Istanbul ↔ Eskisehir. The other pairs are
 * mapped on a best-effort basis; an unmapped code makes the provider return no results rather
 * than throw, so the fallback timetable answers instead.
 */

/** TCDD needs both halves: the id identifies the station, the name is echoed back in the body. */
export interface TcddStation {
  id: number;
  name: string;
}

/**
 * Verified against TCDD's own station service (`cdn-api-prod-ytp…/datas/stations.json`) on
 * 2026-08-11. Regenerate by re-reading that file rather than by editing ids by hand.
 */
const DEFAULT_TCDD_STATIONS: Record<string, TcddStation> = {
  IST: { id: 1325, name: "İSTANBUL(SÖĞÜTLÜÇEŞME)" },
  ESK: { id: 93, name: "ESKİŞEHİR" },
  ANK: { id: 98, name: "ANKARA GAR" },
  KNY: { id: 796, name: "KONYA" },
  KRM: { id: 791, name: "KARAMAN" },
};

/**
 * Reads `TCDD_STATION_IDS`, a JSON object of `{ "IST": { "id": 1325, "name": "…" }, … }`.
 *
 * Malformed JSON is ignored rather than fatal: a typo in an env var should degrade to the
 * built-in mapping, not take the whole app down on a page render.
 */
function parseStationOverrides(raw: string | undefined): Record<string, TcddStation> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, TcddStation> = {};
    for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const { id, name } = value as { id?: unknown; name?: unknown };
      if (typeof id === "number" && Number.isInteger(id) && typeof name === "string" && name !== "") {
        result[code] = { id, name };
      }
    }
    return result;
  } catch {
    console.warn("[tcdd] TCDD_STATION_IDS is not valid JSON — using built-in station mapping.");
    return {};
  }
}

const STATIONS_BY_CODE: Record<string, TcddStation> = {
  ...DEFAULT_TCDD_STATIONS,
  ...parseStationOverrides(process.env.TCDD_STATION_IDS),
};

/** TCDD's station for a CrewRest code, or null if we don't map it. */
export function toTcddStation(code: string): TcddStation | null {
  return STATIONS_BY_CODE[code] ?? null;
}

/** The CrewRest code for a TCDD station name, or null if it isn't one we map. */
export function fromTcddStation(name: string): string | null {
  const normalized = name.trim().toLocaleUpperCase("tr-TR");
  for (const [code, station] of Object.entries(STATIONS_BY_CODE)) {
    if (station.name.trim().toLocaleUpperCase("tr-TR") === normalized) return code;
  }
  return null;
}
