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
 */
const globalForTcddAuth = globalThis as unknown as { tcddToken: string | undefined };

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

/** The User-Agent the token scrape sends. Kept in step with `tcddClient`'s browser header set. */
export const SCRAPE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

async function scrapeToken(fetchImpl: typeof fetch, siteUrl: string): Promise<string> {
  const html = await fetchText(fetchImpl, siteUrl, SCRAPE_USER_AGENT);
  const bundles = [...new Set(html.match(BUNDLE_RE) ?? [])];
  if (bundles.length === 0) {
    throw new TcddAuthError("No index~*.js bundles on the ebilet page — the site layout changed.");
  }

  for (const bundle of bundles) {
    const js = await fetchText(fetchImpl, siteUrl + bundle, SCRAPE_USER_AGENT);
    const found = js.match(TOKEN_RE);
    // Bundles can carry more than one; the site uses the last, so match that.
    if (found && found.length > 0) return found[found.length - 1];
  }

  throw new TcddAuthError("No token found in any ebilet bundle — the site layout changed.");
}

/** The cached token, scraping it first if this process has not got one yet. */
export async function getTcddToken(options: TcddAuthOptions = {}): Promise<string> {
  const cached = globalForTcddAuth.tcddToken;
  if (cached) return cached;

  const token = await scrapeToken(
    options.fetchImpl ?? fetch,
    options.siteUrl ?? EBILET_SITE_URL,
  );
  globalForTcddAuth.tcddToken = token;
  return token;
}

/** Drops the cached token so the next `getTcddToken` re-scrapes. Called on a 401. */
export function resetTcddToken(): void {
  globalForTcddAuth.tcddToken = undefined;
}
