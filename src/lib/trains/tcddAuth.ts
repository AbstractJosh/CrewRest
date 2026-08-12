/**
 * Gets the bearer token for TCDD's ticketing API.
 *
 * There is no account to register and no key to request. TCDD's own booking frontend ships a
 * static RS256 JWT inside its JS bundle and sends it on every call, so that is where this reads
 * it from. The whole approach therefore depends on TCDD's frontend staying roughly as it is: a
 * bundle rename or a token format change breaks it, which is why every failure here is a
 * `TcddAuthError` the caller degrades on rather than an error the page shows.
 */

const BUNDLE_RE = /\/js\/index~[A-Za-z0-9~._-]+\.js/g;

/** The RS256 JWT header, base64url-encoded — how the token is picked out of minified JS. */
const TOKEN_RE = /eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIi[A-Za-z0-9._-]+/g;

const REQUEST_TIMEOUT_MS = 15_000;

export const EBILET_SITE_URL = "https://ebilet.tcddtasimacilik.gov.tr";

export class TcddAuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TcddAuthError";
  }
}

export interface TcddAuthOptions {
  /** Injected in tests so the suite never touches the network. */
  fetchImpl?: typeof fetch;
  siteUrl?: string;
}

/**
 * Pinned to `globalThis` for the same reason `src/lib/prisma.ts` pins the Prisma client: in dev,
 * Next re-evaluates modules on every edit, and a module-local variable would be discarded each
 * time — turning a cached token into a guaranteed re-scrape of TCDD's bundles per keystroke.
 *
 * `tcddTokenPromise` is the scrape currently running, pinned for the same reason and consulted for
 * the same purpose: without it, concurrent callers each start their own.
 */
const globalForTcddAuth = globalThis as unknown as {
  tcddToken: string | undefined;
  tcddTokenPromise: Promise<string> | undefined;
};

async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
  userAgent: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new TcddAuthError(`Could not reach ${url}`, { cause });
  }
  if (!response.ok) {
    throw new TcddAuthError(`${url} responded ${response.status}`);
  }
  return response.text();
}

/**
 * The one User-Agent this integration sends, for the scrape and for the API call alike.
 *
 * It lives here rather than in `tcddClient`'s `BROWSER_HEADERS` only because of the import
 * direction: the client already imports this module, so the constant has to sit on this side to
 * keep the dependency acyclic. Two independent literals drifting apart is the failure this avoids —
 * the scrape and the request must look like the same browser.
 */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

async function scrapeToken(fetchImpl: typeof fetch, siteUrl: string): Promise<string> {
  const html = await fetchText(fetchImpl, siteUrl, BROWSER_USER_AGENT);
  const bundles = [...new Set(html.match(BUNDLE_RE) ?? [])];
  if (bundles.length === 0) {
    throw new TcddAuthError("No index~*.js bundles on the ebilet page — the site layout changed.");
  }

  for (const bundle of bundles) {
    const js = await fetchText(fetchImpl, siteUrl + bundle, BROWSER_USER_AGENT);
    const found = js.match(TOKEN_RE);
    // Bundles can carry more than one; the site uses the last, so match that.
    if (found && found.length > 0) return found[found.length - 1];
  }

  throw new TcddAuthError("No token found in any ebilet bundle — the site layout changed.");
}

/**
 * The cached token, scraping it first if this process has not got one yet.
 *
 * Concurrent callers share one scrape. They do arrive concurrently: the window page runs two
 * `searchTrainsInWindow` calls at once and each batches three days, so a cold process can reach
 * here six times before the first scrape returns. Six copies would converge on the same token, but
 * only after six fetches of ebilet's HTML and six of its bundles — against a WAF-protected
 * unofficial endpoint, exactly the traffic pattern that gets a client blocked.
 */
export async function getTcddToken(options: TcddAuthOptions = {}): Promise<string> {
  const cached = globalForTcddAuth.tcddToken;
  if (cached) return cached;

  const inFlight = globalForTcddAuth.tcddTokenPromise;
  if (inFlight) return inFlight;

  const scrape: Promise<string> = scrapeToken(
    options.fetchImpl ?? fetch,
    options.siteUrl ?? EBILET_SITE_URL,
  )
    .then((token) => {
      globalForTcddAuth.tcddToken = token;
      return token;
    })
    .finally(() => {
      // Cleared on rejection as well as success: a cached rejected promise would keep failing
      // until the process restarted, which is worse than the fan-out this guard exists to stop.
      // Identity-checked so a `resetTcddToken()` mid-scrape can't have its successor cleared.
      if (globalForTcddAuth.tcddTokenPromise === scrape) {
        globalForTcddAuth.tcddTokenPromise = undefined;
      }
    });

  globalForTcddAuth.tcddTokenPromise = scrape;
  return scrape;
}

/**
 * Drops the cached token so the next `getTcddToken` re-scrapes. Called on a 401.
 *
 * Also drops any in-flight scrape, so a caller that arrives after the reset gets a fresh one
 * rather than joining the attempt that produced the token being discarded.
 */
export function resetTcddToken(): void {
  globalForTcddAuth.tcddToken = undefined;
  globalForTcddAuth.tcddTokenPromise = undefined;
}
