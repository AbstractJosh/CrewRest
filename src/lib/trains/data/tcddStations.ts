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

/**
 * TCDD station identifiers, keyed by CrewRest code.
 *
 * These are the names TCDD's own booking site uses. If the API you are pointed at wants numeric
 * ids instead, override the whole map with `TCDD_STATION_IDS` in the environment — see
 * `parseStationOverrides` below — rather than editing this file per deployment.
 */
const DEFAULT_TCDD_STATION_IDS: Record<string, string> = {
  IST: "İSTANBUL(SÖĞÜTLÜÇEŞME)",
  ESK: "ESKİŞEHİR",
  ANK: "ANKARA GAR",
  KNY: "KONYA",
  KRM: "KARAMAN",
};

/**
 * Reads `TCDD_STATION_IDS`, a JSON object of `{ "IST": "<tcdd id>", … }`.
 *
 * Malformed JSON is ignored rather than fatal: a typo in an env var should degrade to the
 * built-in mapping, not take the whole app down on a page render.
 */
function parseStationOverrides(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [code, id] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id === "string" && id.length > 0) result[code] = id;
    }
    return result;
  } catch {
    console.warn("[tcdd] TCDD_STATION_IDS is not valid JSON — using built-in station mapping.");
    return {};
  }
}

const STATION_IDS: Record<string, string> = {
  ...DEFAULT_TCDD_STATION_IDS,
  ...parseStationOverrides(process.env.TCDD_STATION_IDS),
};

/** TCDD's identifier for a CrewRest station code, or null if we don't know it. */
export function toTcddStation(code: string): string | null {
  return STATION_IDS[code] ?? null;
}

/** The CrewRest code for a TCDD identifier, or null if it isn't one we map. */
export function fromTcddStation(tcddId: string): string | null {
  const normalized = tcddId.trim().toLocaleUpperCase("tr-TR");
  for (const [code, id] of Object.entries(STATION_IDS)) {
    if (id.trim().toLocaleUpperCase("tr-TR") === normalized) return code;
  }
  return null;
}
