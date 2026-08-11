/**
 * Live TCDD-backed timetable.
 *
 * TCDD publishes no official API, so this talks to whatever endpoint `TCDD_API_BASE_URL` points
 * at and treats failure as routine rather than exceptional — an unofficial endpoint going away,
 * rate-limiting us, or changing its payload is the expected steady state, not a bug. Every
 * failure path throws `TcddProviderError`, which `FallbackTrainProvider` catches to fall back to
 * the curated timetable.
 */

import type {
  TrainOption,
  TrainProvider,
  TrainProviderCapabilities,
  TrainStation,
} from "@/lib/trains/TrainProvider";
import { STATIONS, YHT_ROUTES } from "@/lib/trains/data/yhtRoutes";
import { toTcddStation } from "@/lib/trains/data/tcddStations";
import { mapTcddResponse } from "@/lib/trains/tcddResponse";
import { TURKEY_UTC_OFFSET_MINUTES } from "@/lib/time/turkeyTime";

export class TcddProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TcddProviderError";
  }
}

const REQUEST_TIMEOUT_MS = 8_000;
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

/** Türkiye-local calendar date, "YYYY-MM-DD" — what the API is asked for, and the cache key. */
function turkeyDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

export interface TcddProviderConfig {
  baseUrl: string;
  token?: string;
  /** Path appended to `baseUrl` for a timetable search. */
  searchPath?: string;
}

export function readTcddConfigFromEnv(): TcddProviderConfig | null {
  const baseUrl = process.env.TCDD_API_BASE_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token: process.env.TCDD_API_TOKEN?.trim() || undefined,
    searchPath: process.env.TCDD_API_SEARCH_PATH?.trim() || "/search",
  };
}

export class TcddTrainProvider implements TrainProvider {
  /**
   * Fares and seat availability are claimed because every known TCDD wrapper exposes them, but
   * the mapper leaves those fields undefined when they're absent — so the UI reads the option,
   * not this flag, before rendering a price. `booking` stays false: TCDD settles payment through
   * a bank 3-D Secure redirect, which is not something this app can drive.
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
    if (cached && cached.expiresAt > Date.now()) return cached.options;

    const payload = await this.fetchTimetable(origin.name, destination.name, dateKey);
    const options = mapTcddResponse(payload, { originCode, destinationCode, date });

    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, options });
    return options;
  }

  private async fetchTimetable(
    origin: string,
    destination: string,
    dateKey: string,
  ): Promise<unknown> {
    const url = new URL(
      `${this.config.baseUrl}${this.config.searchPath ?? "/search"}`,
    );
    url.searchParams.set("from", origin);
    url.searchParams.set("to", destination);
    url.searchParams.set("date", dateKey);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...(this.config.token
            ? { Authorization: `Bearer ${this.config.token}` }
            : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        // The provider caches results itself; Next shouldn't hold a second, differently-scoped copy.
        cache: "no-store",
      });
    } catch (cause) {
      throw new TcddProviderError(
        `TCDD request failed for ${origin}→${destination} on ${dateKey}`,
        { cause },
      );
    }

    if (!response.ok) {
      throw new TcddProviderError(
        `TCDD responded ${response.status} for ${origin}→${destination} on ${dateKey}`,
      );
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new TcddProviderError("TCDD returned a body that isn't JSON", { cause });
    }
  }
}
