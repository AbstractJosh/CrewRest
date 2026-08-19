/**
 * Live TCDD-backed timetable.
 *
 * Thin by design: `tcddAuth` gets the token, `tcddClient` makes the request, `tcddResponse` maps
 * the payload. What is left here is caching and the decision not to bother asking about a station
 * we cannot name. Every failure below the seam surfaces as `TcddProviderError`, which
 * `FallbackTrainProvider` catches to fall back to the curated timetable.
 */

import type {
  TrainOption,
  TrainProvider,
  TrainProviderCapabilities,
  TrainStation,
} from "@/lib/trains/TrainProvider";
import { STATIONS, YHT_ROUTES } from "@/lib/trains/data/yhtRoutes";
import { toTcddStation, type TcddStation } from "@/lib/trains/data/tcddStations";
import {
  formatTcddDate,
  requestAvailability,
  TcddProviderError,
  type TcddClientOptions,
} from "@/lib/trains/tcddClient";
import { mapTcddResponse } from "@/lib/trains/tcddResponse";
import { turkeyDateKey } from "@/lib/time/turkeyTime";

export { TcddProviderError };

const CACHE_TTL_MS = 10 * 60_000;

interface CacheEntry {
  expiresAt: number;
  options: TrainOption[];
}

/**
 * Pinned to `globalThis` for the same reason `src/lib/prisma.ts` pins the Prisma client: in dev,
 * Next re-evaluates modules on every edit, and a module-local Map would be discarded each time —
 * turning a cache into a guarantee of a fresh request per keystroke.
 */
const globalForTcdd = globalThis as unknown as {
  tcddTimetableCache: Map<string, CacheEntry> | undefined;
};

const cache = (globalForTcdd.tcddTimetableCache ??= new Map<string, CacheEntry>());

/**
 * Empties the timetable cache. The token cache has `resetTcddToken` for the same reason: a
 * process-wide store pinned to `globalThis` needs a way to be cleared, or every test in a file
 * shares whatever the first one populated.
 */
export function resetTcddTimetableCache(): void {
  cache.clear();
}

export interface TcddProviderConfig {
  /** Overrides the built-in API base. Only needed to point at a proxy or a test double. */
  baseUrl?: string;
  clientOptions?: TcddClientOptions;
}

/**
 * The live provider needs no credential — the token is scraped at runtime — so there is nothing
 * to check for and this always returns a config. `TCDD_API_BASE_URL` remains an override for
 * pointing at a proxy, not the switch that turns the integration on.
 */
export function readTcddConfigFromEnv(): TcddProviderConfig {
  const baseUrl = process.env.TCDD_API_BASE_URL?.trim();
  return baseUrl ? { baseUrl: baseUrl.replace(/\/+$/, "") } : {};
}

export class TcddTrainProvider implements TrainProvider {
  /**
   * `booking` stays false: TCDD settles payment through a bank 3-D Secure redirect, which is not
   * something this app can drive. The other three are now genuinely backed — verified against the
   * live endpoint rather than assumed.
   */
  readonly capabilities: TrainProviderCapabilities = {
    liveTimetable: true,
    fares: true,
    seatAvailability: true,
    booking: false,
  };

  constructor(private readonly config: TcddProviderConfig) {}

  /**
   * Still served from the curated route list: which cities the pilot may pick as home is a
   * configuration question, not a live one, and it must keep working when TCDD is unreachable.
   */
  listDestinationsFromIstanbul(): TrainStation[] {
    return YHT_ROUTES.filter((route) => route.originCode === "IST").map(
      (route) => STATIONS[route.destinationCode],
    );
  }

  /** Seam for tests — overriding this keeps the suite off the network. */
  protected async fetchPayload(
    origin: TcddStation,
    destination: TcddStation,
    date: Date,
  ): Promise<unknown> {
    return requestAvailability(origin, destination, formatTcddDate(date), {
      ...this.config.clientOptions,
      baseUrl: this.config.baseUrl ?? this.config.clientOptions?.baseUrl,
    });
  }

  async searchTrains(
    originCode: string,
    destinationCode: string,
    date: Date,
  ): Promise<TrainOption[]> {
    const origin = toTcddStation(originCode);
    const destination = toTcddStation(destinationCode);
    // An unmapped station is a gap in our data, not a TCDD failure — no point spending a request
    // on it, and no point failing over to the fallback either.
    if (!origin || !destination) return [];

    const dateKey = turkeyDateKey(date);
    const cacheKey = `${originCode}|${destinationCode}|${dateKey}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.expiresAt > Date.now()) return cached.options;
      // Dropped rather than left to be overwritten: a stale entry for a date nobody asks about
      // again would otherwise sit in a process-lifetime Map forever.
      cache.delete(cacheKey);
    }

    const payload = await this.fetchPayload(origin, destination, date);
    const options = mapTcddResponse(payload, { originCode, destinationCode, date });

    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, options });
    return options;
  }
}
