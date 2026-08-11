/**
 * Talks to the API that ebilet.tcddtasimacilik.gov.tr uses.
 *
 * TCDD publishes no official API and no contract for this one, so a failure here is routine
 * rather than exceptional — the endpoint changing shape, rate-limiting us, or disappearing is the
 * expected steady state. Every failure path throws `TcddProviderError`, which
 * `FallbackTrainProvider` catches to fall back to the curated timetable.
 */

import type { TcddStation } from "@/lib/trains/data/tcddStations";
import { getTcddToken, resetTcddToken, type TcddAuthOptions } from "@/lib/trains/tcddAuth";
import { TURKEY_UTC_OFFSET_MINUTES } from "@/lib/time/turkeyTime";

export class TcddProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TcddProviderError";
  }
}

export const TCDD_API_BASE_URL = "https://web-api-prod-ytp.tcddtasimacilik.gov.tr/tms";

const AVAILABILITY_PATH = "/train/train-availability";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The WAF in front of TCDD rejects anything that does not look like a browser, so this set is
 * load-bearing: strip the `sec-*` headers, the `Origin`/`Referer` pair or `unit-id` and the
 * endpoint answers 403. It is not decoration and it is not safe to "tidy up".
 */
export const BROWSER_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "tr",
  "Content-Type": "application/json",
  Origin: "https://ebilet.tcddtasimacilik.gov.tr",
  Referer: "https://ebilet.tcddtasimacilik.gov.tr/",
  "sec-ch-ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "unit-id": "3895",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
};

/** Constant query parameters the site's own axios interceptor adds to every call. */
const COMMON_PARAMS: Record<string, string> = { environment: "dev", userId: "1" };

export interface TcddClientOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  authOptions?: TcddAuthOptions;
}

/**
 * The Türkiye-local day, in the "DD-MM-YYYY 00:00:00" form the API expects.
 *
 * Shifting into UTC first is the only safe way to ask "which Türkiye day is this instant on" —
 * `getDate()` would answer for the server's zone, which is not Istanbul.
 */
export function formatTcddDate(date: Date): string {
  const shifted = new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${shifted.getUTCFullYear()} 00:00:00`;
}

function buildBody(
  origin: TcddStation,
  destination: TcddStation,
  departureDate: string,
): string {
  return JSON.stringify({
    searchRoutes: [
      {
        departureStationId: origin.id,
        departureStationName: origin.name,
        arrivalStationId: destination.id,
        arrivalStationName: destination.name,
        departureDate,
      },
    ],
    // One adult. CrewRest plans for the pilot alone; passenger type 0 is the standard fare.
    passengerTypeCounts: [{ id: 0, count: 1 }],
    searchReservation: false,
    searchType: "DOMESTIC",
  });
}

/**
 * One timetable/availability search. Returns the raw payload — mapping is `tcddResponse`'s job.
 *
 * A 401 means the scraped token went stale, which happens on TCDD's schedule, not ours: drop it,
 * scrape a fresh one and retry exactly once. Retrying further would spin against a token TCDD is
 * refusing for some other reason.
 */
export async function requestAvailability(
  origin: TcddStation,
  destination: TcddStation,
  departureDate: string,
  options: TcddClientOptions = {},
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? TCDD_API_BASE_URL).replace(/\/+$/, "");

  const url = new URL(baseUrl + AVAILABILITY_PATH);
  for (const [key, value] of Object.entries(COMMON_PARAMS)) {
    url.searchParams.set(key, value);
  }

  const body = buildBody(origin, destination, departureDate);
  const label = `${origin.name}→${destination.name} on ${departureDate}`;

  const send = async (): Promise<Response> => {
    const token = await getTcddToken(options.authOptions);
    try {
      return await fetchImpl(url, {
        method: "POST",
        headers: { ...BROWSER_HEADERS, Authorization: token },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        // The provider caches results itself; Next shouldn't hold a second, differently-scoped copy.
        cache: "no-store",
      });
    } catch (cause) {
      throw new TcddProviderError(`TCDD request failed for ${label}`, { cause });
    }
  };

  let response = await send();
  if (response.status === 401) {
    resetTcddToken();
    response = await send();
  }

  if (!response.ok) {
    throw new TcddProviderError(`TCDD responded ${response.status} for ${label}`);
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new TcddProviderError("TCDD returned a body that isn't JSON", { cause });
  }
}
