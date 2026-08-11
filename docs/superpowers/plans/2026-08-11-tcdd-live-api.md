# TCDD Live API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CrewRest's guessed TCDD live-timetable path with the ebilet API that was verified by live probe on 2026-08-11.

**Architecture:** The `TrainProvider` seam does not move. Behind it, `TcddTrainProvider` is split into three focused modules — `tcddAuth` (scrapes and caches the JWT), `tcddClient` (WAF headers, POST, retry), and the rewritten `tcddResponse` mapper — with the provider left as thin orchestration. `FallbackTrainProvider` still catches every failure and degrades to the curated static timetable.

**Tech Stack:** TypeScript, Next.js 16 App Router, `node:test` via `tsx`, native `fetch`.

**Spec:** `docs/superpowers/specs/2026-08-11-tcdd-live-api-design.md` — read it first.

## Global Constraints

- **Never use `getHours()`, `toLocaleString()`, bare `new Date(y, m, d)`, or `new Date()` on a zoneless string.** Turkey time goes through `src/lib/time/turkeyTime.ts`. See CLAUDE.md.
- **Any test asserting on parsed local times must set `process.env.TZ` to a non-Turkish zone before its first import**, and the file must keep a guard assertion proving the pin took effect.
- **A failing live request is the expected steady state, not a bug.** Every failure path throws `TcddProviderError` so `FallbackTrainProvider` can degrade. Never let the page error.
- **New optional fields on `TrainOption` / `TrainFare` must stay optional** so `StaticTrainProvider` keeps compiling.
- **Never commit a roster PDF, `dev.db`, or `.env`.** Timetable fixtures are the documented exception — they contain no personal data.
- Run tests with `npm test`. A single file: `node --import tsx --test src/lib/trains/<file>.test.ts`.
- Excluded cabin classes: `["DSB"]` (wheelchair spaces). Everything else counts as bookable.
- Verified station ids: `İSTANBUL(SÖĞÜTLÜÇEŞME)` 1325, `ESKİŞEHİR` 93, `ANKARA GAR` 98, `KONYA` 796, `KARAMAN` 791.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/trains/data/tcddStations.ts` | *modify* — CrewRest code ⇄ TCDD `{id, name}` |
| `src/lib/trains/tcddAuth.ts` | *create* — scrape, cache and refresh the ebilet JWT |
| `src/lib/trains/tcddClient.ts` | *create* — WAF headers, availability POST, 401 retry, error translation |
| `src/lib/trains/tcddResponse.ts` | *modify* — map the real payload to `TrainOption[]` |
| `src/lib/trains/TcddTrainProvider.ts` | *modify* — orchestration only |
| `src/lib/trains/booking.ts` | *modify* — real ebilet deep link by default |
| `src/lib/trains/index.ts` | *modify* — live provider on by default |
| `src/lib/trains/__fixtures__/` | *create* — trimmed real captures + README |

---

### Task 1: Station map carries numeric ids

**Files:**
- Modify: `src/lib/trains/data/tcddStations.ts` (whole file)
- Modify: `src/lib/trains/booking.ts:46-54` (call-site fix only — the real rewrite is Task 7)
- Test: `src/lib/trains/data/tcddStations.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `interface TcddStation { id: number; name: string }`, `toTcddStation(code: string): TcddStation | null`, `fromTcddStation(name: string): string | null`.

**Why this changes:** the availability body needs the id *and* the name. `Pilot.homeStationCode` keeps CrewRest's own codes, so there is no data migration — this file is the edge mapping that exists precisely so TCDD's ids can churn without touching the database.

- [ ] **Step 1: Write the failing test**

Create `src/lib/trains/data/tcddStations.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/trains/data/tcddStations.test.ts`
Expected: FAIL — `toTcddStation` still returns a string, so `assert.deepEqual` against an object fails.

- [ ] **Step 3: Rewrite the station map**

Replace the body of `src/lib/trains/data/tcddStations.ts` below its existing file-level comment (keep that comment, it still describes why this file exists):

```ts
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
```

- [ ] **Step 4: Fix the booking.ts call site so the project still compiles**

In `src/lib/trains/booking.ts`, change lines 46-48 from reading strings to reading the station object. Task 7 rewrites this function properly; this step only keeps the build green.

```ts
  const from = toTcddStation(option.originCode);
  const to = toTcddStation(option.destinationCode);
  if (!from || !to) return EBILET_SEARCH_URL;

  const replacements: Record<string, string> = {
    "{from}": encodeURIComponent(from.name),
    "{to}": encodeURIComponent(to.name),
    "{date}": turkeyDateKey(option.departureAt),
    "{time}": formatTurkeyTime(option.departureAt),
  };
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `node --import tsx --test src/lib/trains/data/tcddStations.test.ts && node --import tsx --test src/lib/trains/booking.test.ts && npx tsc --noEmit`
Expected: both test files PASS, `tsc` clean.

If `tsc` reports `src/generated/prisma` is missing, run `npx prisma generate` first — a fresh clone will not typecheck until it has.

- [ ] **Step 6: Commit**

```bash
git add src/lib/trains/data/tcddStations.ts src/lib/trains/data/tcddStations.test.ts src/lib/trains/booking.ts
git commit -m "Map CrewRest station codes to TCDD ids, not just names"
```

---

### Task 2: `tcddAuth` — the JWT nobody issues you

**Files:**
- Create: `src/lib/trains/tcddAuth.ts`
- Test: `src/lib/trains/tcddAuth.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class TcddAuthError extends Error`
  - `interface TcddAuthOptions { fetchImpl?: typeof fetch; siteUrl?: string }`
  - `getTcddToken(options?: TcddAuthOptions): Promise<string>`
  - `resetTcddToken(): void`
  - `const EBILET_SITE_URL: string`

**Why this exists:** there is no account and no API key. TCDD's frontend ships a static JWT inside its own JS bundle; you read it from there. The cache is pinned to `globalThis` for the same reason `src/lib/prisma.ts` pins its client — in dev Next re-evaluates modules on every edit, and a module-local variable would mean re-scraping TCDD's bundles on every keystroke.

- [ ] **Step 1: Write the failing test**

Create `src/lib/trains/tcddAuth.test.ts`:

```ts
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getTcddToken, resetTcddToken, TcddAuthError } from "@/lib/trains/tcddAuth";

/** Shaped like the real one: the regex keys off this exact RS256 JWT header prefix. */
const TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIi." + "a".repeat(40) + ".sig";

/** Serves a page listing one bundle, and a bundle with the token buried in it. */
function stubFetch(pages: Record<string, string>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const body = pages[url];
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const SITE = "https://ebilet.example";

beforeEach(() => resetTcddToken());

describe("getTcddToken", () => {
  it("pulls the token out of the site's JS bundle", async () => {
    const { fetchImpl } = stubFetch({
      [SITE]: `<script src="/js/index~abc.deadbeef.js"></script>`,
      [`${SITE}/js/index~abc.deadbeef.js`]: `var x=1;var t="${TOKEN}";`,
    });

    assert.equal(await getTcddToken({ fetchImpl, siteUrl: SITE }), TOKEN);
  });

  it("caches, so a second call makes no further requests", async () => {
    const { fetchImpl, calls } = stubFetch({
      [SITE]: `<script src="/js/index~abc.deadbeef.js"></script>`,
      [`${SITE}/js/index~abc.deadbeef.js`]: TOKEN,
    });

    await getTcddToken({ fetchImpl, siteUrl: SITE });
    const after = calls.length;
    await getTcddToken({ fetchImpl, siteUrl: SITE });

    assert.equal(calls.length, after, "cached token should not re-scrape");
  });

  it("re-scrapes after a reset, which is what a 401 triggers", async () => {
    const { fetchImpl, calls } = stubFetch({
      [SITE]: `<script src="/js/index~abc.deadbeef.js"></script>`,
      [`${SITE}/js/index~abc.deadbeef.js`]: TOKEN,
    });

    await getTcddToken({ fetchImpl, siteUrl: SITE });
    resetTcddToken();
    await getTcddToken({ fetchImpl, siteUrl: SITE });

    assert.equal(calls.length, 4);
  });

  it("keeps looking when the first bundle has no token", async () => {
    const { fetchImpl } = stubFetch({
      [SITE]: `<script src="/js/index~one.aaa.js"></script><script src="/js/index~two.bbb.js"></script>`,
      [`${SITE}/js/index~one.aaa.js`]: "nothing here",
      [`${SITE}/js/index~two.bbb.js`]: TOKEN,
    });

    assert.equal(await getTcddToken({ fetchImpl, siteUrl: SITE }), TOKEN);
  });

  it("throws TcddAuthError when the bundles carry no token", async () => {
    const { fetchImpl } = stubFetch({
      [SITE]: `<script src="/js/index~abc.deadbeef.js"></script>`,
      [`${SITE}/js/index~abc.deadbeef.js`]: "TCDD redesigned the site",
    });

    await assert.rejects(
      () => getTcddToken({ fetchImpl, siteUrl: SITE }),
      TcddAuthError,
    );
  });

  it("throws TcddAuthError when the page lists no bundles at all", async () => {
    const { fetchImpl } = stubFetch({ [SITE]: "<html>maintenance</html>" });

    await assert.rejects(
      () => getTcddToken({ fetchImpl, siteUrl: SITE }),
      TcddAuthError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/trains/tcddAuth.test.ts`
Expected: FAIL — `Cannot find module '@/lib/trains/tcddAuth'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/trains/tcddAuth.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/trains/tcddAuth.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trains/tcddAuth.ts src/lib/trains/tcddAuth.test.ts
git commit -m "Add tcddAuth: read the ebilet JWT from TCDD's own JS bundle"
```

---

### Task 3: `tcddClient` — the request the WAF accepts

**Files:**
- Create: `src/lib/trains/tcddClient.ts`
- Test: `src/lib/trains/tcddClient.test.ts`

**Interfaces:**
- Consumes: `getTcddToken`, `resetTcddToken`, `TcddAuthError` from Task 2; `TcddStation` from Task 1.
- Produces:
  - `class TcddProviderError extends Error` (moved here from `TcddTrainProvider.ts`)
  - `interface TcddClientOptions { fetchImpl?: typeof fetch; baseUrl?: string; authOptions?: TcddAuthOptions }`
  - `requestAvailability(origin: TcddStation, destination: TcddStation, departureDate: string, options?: TcddClientOptions): Promise<unknown>`
  - `formatTcddDate(date: Date): string`
  - `const TCDD_API_BASE_URL: string`, `const BROWSER_HEADERS: Record<string, string>`

**Why the headers matter:** TCDD sits behind a WAF that answers `403` to anything that does not look like a browser. The `sec-ch-ua*` / `sec-fetch-*` / `Origin` / `Referer` / `unit-id` set is load-bearing, not decoration. Do not "clean it up".

- [ ] **Step 1: Write the failing test**

Create `src/lib/trains/tcddClient.test.ts`:

```ts
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { resetTcddToken } from "@/lib/trains/tcddAuth";
import {
  BROWSER_HEADERS,
  formatTcddDate,
  requestAvailability,
  TcddProviderError,
} from "@/lib/trains/tcddClient";

const TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIi." + "a".repeat(40) + ".sig";
const SITE = "https://ebilet.example";
const BASE = "https://api.example/tms";

const IST = { id: 1325, name: "İSTANBUL(SÖĞÜTLÜÇEŞME)" };
const ESK = { id: 93, name: "ESKİŞEHİR" };

const AUTH_PAGES: Record<string, string> = {
  [SITE]: `<script src="/js/index~a.b.js"></script>`,
  [`${SITE}/js/index~a.b.js`]: TOKEN,
};

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

/** `availability` is the sequence of responses the API endpoint returns, one per call. */
function stubFetch(availability: Response[]) {
  const calls: Recorded[] = [];
  let next = 0;
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const page = AUTH_PAGES[url];
    if (page !== undefined) return new Response(page, { status: 200 });
    const response = availability[next];
    next += 1;
    if (!response) throw new Error(`unexpected extra request to ${url}`);
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const options = (fetchImpl: typeof fetch) => ({
  fetchImpl,
  baseUrl: BASE,
  authOptions: { fetchImpl, siteUrl: SITE },
});

beforeEach(() => resetTcddToken());

describe("formatTcddDate", () => {
  it("formats the Türkiye-local day as DD-MM-YYYY 00:00:00", () => {
    // 15 Aug 2026 00:30 Türkiye time is still 14 Aug in UTC — the local day is what TCDD wants.
    assert.equal(formatTcddDate(buildTurkeyDate(2026, 7, 15, 0, 30)), "15-08-2026 00:00:00");
    assert.equal(formatTcddDate(buildTurkeyDate(2026, 0, 3, 23, 45)), "03-01-2026 00:00:00");
  });
});

describe("requestAvailability", () => {
  it("posts the search body TCDD expects", async () => {
    const { fetchImpl, calls } = stubFetch([json({ trainLegs: [] })]);

    await requestAvailability(IST, ESK, "15-08-2026 00:00:00", options(fetchImpl));

    const post = calls.find((c) => c.url.startsWith(BASE));
    assert.ok(post, "should have called the availability endpoint");
    assert.equal(post.init?.method, "POST");
    assert.match(post.url, /environment=dev/);
    assert.match(post.url, /userId=1/);

    assert.deepEqual(JSON.parse(String(post.init?.body)), {
      searchRoutes: [
        {
          departureStationId: 1325,
          departureStationName: "İSTANBUL(SÖĞÜTLÜÇEŞME)",
          arrivalStationId: 93,
          arrivalStationName: "ESKİŞEHİR",
          departureDate: "15-08-2026 00:00:00",
        },
      ],
      passengerTypeCounts: [{ id: 0, count: 1 }],
      searchReservation: false,
      searchType: "DOMESTIC",
    });
  });

  it("sends the browser headers the WAF requires, and a bare Authorization", async () => {
    const { fetchImpl, calls } = stubFetch([json({ trainLegs: [] })]);

    await requestAvailability(IST, ESK, "15-08-2026 00:00:00", options(fetchImpl));

    const post = calls.find((c) => c.url.startsWith(BASE));
    const headers = post?.init?.headers as Record<string, string>;
    for (const key of Object.keys(BROWSER_HEADERS)) {
      assert.equal(headers[key], BROWSER_HEADERS[key], `missing WAF header ${key}`);
    }
    // Not "Bearer <token>" — TCDD rejects the prefixed form.
    assert.equal(headers.Authorization, TOKEN);
  });

  it("refreshes the token and retries once on a 401", async () => {
    const { fetchImpl, calls } = stubFetch([
      json({ error: "expired" }, 401),
      json({ trainLegs: ["ok"] }),
    ]);

    const payload = await requestAvailability(IST, ESK, "15-08-2026 00:00:00", options(fetchImpl));

    assert.deepEqual(payload, { trainLegs: ["ok"] });
    assert.equal(calls.filter((c) => c.url.startsWith(BASE)).length, 2);
  });

  it("gives up after one retry rather than looping on a persistent 401", async () => {
    const { fetchImpl, calls } = stubFetch([
      json({ error: "expired" }, 401),
      json({ error: "expired" }, 401),
    ]);

    await assert.rejects(
      () => requestAvailability(IST, ESK, "15-08-2026 00:00:00", options(fetchImpl)),
      TcddProviderError,
    );
    assert.equal(calls.filter((c) => c.url.startsWith(BASE)).length, 2);
  });

  it("turns a 403 from the WAF into TcddProviderError", async () => {
    const { fetchImpl } = stubFetch([new Response("blocked", { status: 403 })]);

    await assert.rejects(
      () => requestAvailability(IST, ESK, "15-08-2026 00:00:00", options(fetchImpl)),
      TcddProviderError,
    );
  });

  it("turns a non-JSON body into TcddProviderError", async () => {
    const { fetchImpl } = stubFetch([new Response("<html>go away</html>", { status: 200 })]);

    await assert.rejects(
      () => requestAvailability(IST, ESK, "15-08-2026 00:00:00", options(fetchImpl)),
      TcddProviderError,
    );
  });

  it("turns a transport failure into TcddProviderError", async () => {
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      const page = AUTH_PAGES[url];
      if (page !== undefined) return new Response(page, { status: 200 });
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;

    await assert.rejects(
      () => requestAvailability(IST, ESK, "15-08-2026 00:00:00", options(fetchImpl)),
      TcddProviderError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/trains/tcddClient.test.ts`
Expected: FAIL — `Cannot find module '@/lib/trains/tcddClient'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/trains/tcddClient.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/trains/tcddClient.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trains/tcddClient.ts src/lib/trains/tcddClient.test.ts
git commit -m "Add tcddClient: the availability POST the TCDD WAF accepts"
```

---

### Task 4: Real fixtures

**Files:**
- Create: `src/lib/trains/__fixtures__/tcdd-ist-esk.json`
- Create: `src/lib/trains/__fixtures__/tcdd-esk-ist.json`
- Create: `src/lib/trains/__fixtures__/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: two fixture files read by Task 5's tests.

**Privacy note before you start:** CLAUDE.md forbids committing fixtures built from real data. That rule is about rosters, which carry passport numbers, medical dates and colleagues' names. A timetable response carries none of that — it is public departure data. Committing these is deliberate and the README records why, so it does not read as a violation later.

- [ ] **Step 1: Copy the captures in**

The trimmed captures already exist in this session's scratchpad:

```bash
mkdir -p src/lib/trains/__fixtures__
cp "$SCRATCHPAD/tcdd-ist-esk.json" src/lib/trains/__fixtures__/
cp "$SCRATCHPAD/tcdd-esk-ist.json" src/lib/trains/__fixtures__/
```

where `$SCRATCHPAD` is `C:/Users/Joshy/AppData/Local/Temp/claude/C--Users-Joshy-Desktop-Projects-CrewRest/d635487a-b182-48d7-abac-54a57c187b4a/scratchpad`.

- [ ] **Step 2: Verify the fixtures are the expected shape**

Run:

```bash
node -e "
for (const f of ['tcdd-ist-esk','tcdd-esk-ist']) {
  const j = require('./src/lib/trains/__fixtures__/' + f + '.json');
  const t = j.trainLegs[0].trainAvailabilities.flatMap(a => a.trains);
  console.log(f, t.map(x => x.number + '/' + x.segments.length + 'seg').join(' '));
}"
```

Expected exactly:
```
tcdd-ist-esk 81034/7seg 81030/8seg 12002/8seg
tcdd-esk-ist 81001/2seg 22001/10seg
```

If the scratchpad is gone, regenerate by re-probing — but note the data will be for a different date, and Task 5's assertions are pinned to these instants, so prefer recovering the files.

- [ ] **Step 3: Write the README**

Create `src/lib/trains/__fixtures__/README.md`:

````markdown
# TCDD response fixtures

Real responses from `POST web-api-prod-ytp.tcddtasimacilik.gov.tr/tms/train/train-availability`,
captured 2026-08-11 for travel on 2026-08-15.

## Why these are committed when roster fixtures are not

CLAUDE.md forbids fixtures built from real data. That rule protects roster PDFs, which contain the
holder's passport number, medical record dates and the names of every colleague they flew with.

A timetable response contains none of that: train numbers, times, prices and seat counts, all of
which TCDD publishes to anyone who loads its website. There is no passenger data in these files —
the request is an anonymous availability search, not a booking.

## How they were trimmed

The originals are 573 KB combined. Trimming **deleted only** — no retained value was edited, so
every field present is verbatim what TCDD sent. Removed:

- all trains except the ones listed below
- `cars` (per-carriage seat maps)
- `bookingClassCapacities` and `trainSegments`
- every station field except `id` and `name`

## What each train is here to test

`tcdd-ist-esk.json` — İstanbul(Söğütlüçeşme) → Eskişehir

| Train | Why |
| --- | --- |
| 81034 | Several cabin classes at once: C ×12, Y1 ×133, DSB ×2 |
| 81030 | DSB-only — must map to `isSoldOut: true`, because a pilot cannot book a wheelchair space |
| 12002 | Overnight, 22:47 → 03:19, crossing midnight |

`tcdd-esk-ist.json` — Eskişehir → İstanbul(Söğütlüçeşme)

| Train | Why |
| --- | --- |
| 81001 | Only 2 segments, so "arrival is the last segment" is exercised at the short end too |
| 22001 | The sleeper: cabin class B ×8 alongside Y1 ×153. Departs 01:28, arrives 06:26 — inside the metro's post-midnight boarding band and after the 06:00 alighting floor |

## Refreshing them

Only if TCDD changes shape. Re-run the capture, re-trim, and expect to update the pinned instants
in `tcddResponse.test.ts` — they are absolute epoch values tied to the captured date.
````

- [ ] **Step 4: Commit**

```bash
git add src/lib/trains/__fixtures__
git commit -m "Add real TCDD availability fixtures for both directions"
```

---

### Task 5: Rewrite the response mapper

**Files:**
- Modify: `src/lib/trains/tcddResponse.ts` (substantial rewrite)
- Modify: `src/lib/trains/TrainProvider.ts:7-15` (add `TrainFare.code`)
- Modify: `src/lib/trains/tcddResponse.test.ts` (replace the invented fixtures)

**Interfaces:**
- Consumes: fixtures from Task 4.
- Produces: `mapTcddResponse(payload: unknown, options: MapTcddOptions): TrainOption[]`, `parseTcddInstant(value: unknown, referenceDate: Date): Date | null`, `EXCLUDED_CABIN_CODES: readonly string[]`. `MapTcddOptions` is unchanged: `{ originCode: string; destinationCode: string; date: Date }`.

**What is being deleted and why:** `findTrainArray` and the multi-spelling `pick`/`pickString`/`pickNumber` helpers go. They existed to hedge a guess about the payload. Now that the shape is known they are actively harmful — they would turn a real upstream change into a silently empty result instead of a `TcddProviderError` that fails over to estimates.

**Two traps:**
1. Arrival is the **last** segment's `arrivalTime`. A train carries every intermediate segment of its whole run, so `segments[0].arrivalTime` is arrival at the first intermediate stop — nine minutes in, not three hours.
2. Cabin codes and booking codes are different namespaces **and they collide**: cabin class `B` is YATAKLI (sleeper), booking class `B` is EKONOMİ STANDART. Read codes off `cabinClass.code` only.
3. `minPrice: null` with `availabilityCount: 0` is normal, not corrupt — it is how TCDD reports a class that has sold out. In the fixtures, LOCA is priced `null` on every train and BUSİNESS/EKONOMİ are `null` on `81030`. The `typeof price === "number"` guard skips them, which is correct: a class you cannot buy has no price to show. Do not "fix" this by defaulting the price to zero.

- [ ] **Step 1: Add `code` to `TrainFare`**

In `src/lib/trains/TrainProvider.ts`, add one optional field to `TrainFare` (optional so `StaticTrainProvider` keeps compiling):

```ts
export interface TrainFare {
  /** Cabin/seat class as the provider names it, e.g. "EKONOMİ", "BUSİNESS". */
  className: string;
  /**
   * The provider's own cabin-class code (`Y1`, `C`, `L`, `B`, `DSB`). Note this is the *cabin*
   * namespace, which collides with the booking-class one — cabin `B` is a sleeper berth, booking
   * class `B` is economy standard.
   */
  code?: string;
  /** Price in the currency's minor unit (kuruş) — integers avoid float drift. */
  priceMinor: number;
  currency: string;
  /** Seats left in this class, when the provider reports it. */
  availableSeats?: number;
}
```

- [ ] **Step 2: Write the failing tests**

In `src/lib/trains/tcddResponse.test.ts`, keep the entire `describe("parseTcddInstant")` block and the `process.env.TZ` pin exactly as they are — the mapper can still meet a string timestamp, and the guard assertion is what stops the suite passing vacuously. Replace the whole `describe("mapTcddResponse")` block with:

```ts
import { readFileSync } from "node:fs";
import { EXCLUDED_CABIN_CODES } from "@/lib/trains/tcddResponse";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), "utf8"),
  );
}

describe("mapTcddResponse", () => {
  const outbound = () => mapTcddResponse(fixture("tcdd-ist-esk"), MAP_OPTIONS);

  it("reads every train out of the trainLegs → trainAvailabilities → trains nesting", () => {
    assert.deepEqual(
      outbound().map((t) => t.trainNumber),
      ["81034", "81030", "12002"],
    );
  });

  it("takes departure from the first segment and arrival from the last", () => {
    const [train] = outbound();
    // 06:30 → 09:25 Türkiye local on 2026-08-15. Reading segments[0].arrivalTime instead would
    // give 06:39 — arrival at the first intermediate stop, not at Eskişehir.
    assert.equal(train.departureAt.toISOString(), "2026-08-15T03:30:00.000Z");
    assert.equal(train.arrivalAt.toISOString(), "2026-08-15T06:25:00.000Z");
    assert.equal(train.durationMinutes, 175);
  });

  it("carries the route and provenance through", () => {
    const [train] = outbound();
    assert.equal(train.originCode, "IST");
    assert.equal(train.destinationCode, "ESK");
    assert.equal(train.source, "live");
    assert.equal(train.providerTrainId, "191862");
  });

  it("maps one fare per cabin class, priced in kuruş", () => {
    const [train] = outbound();
    const business = train.fares?.find((f) => f.code === "C");
    const economy = train.fares?.find((f) => f.code === "Y1");

    assert.equal(business?.className, "BUSİNESS");
    assert.equal(business?.priceMinor, 90000);
    assert.equal(business?.currency, "TRY");
    assert.equal(business?.availableSeats, 12);
    assert.equal(economy?.availableSeats, 133);
  });

  it("counts bookable seats and ignores wheelchair spaces", () => {
    const [train] = outbound();
    // C 12 + Y1 133 = 145. The DSB 2 is not a seat this pilot can buy.
    assert.equal(train.availableSeats, 145);
    assert.equal(train.isSoldOut, false);
  });

  it("treats a train with only wheelchair spaces left as sold out", () => {
    const soldOut = outbound().find((t) => t.trainNumber === "81030");
    assert.equal(soldOut?.availableSeats, 0);
    assert.equal(soldOut?.isSoldOut, true);
  });

  it("keeps an overnight service on the right side of midnight", () => {
    const overnight = outbound().find((t) => t.trainNumber === "12002");
    // 22:47 on the 15th → 03:19 on the 16th, Türkiye local.
    assert.equal(overnight?.departureAt.toISOString(), "2026-08-15T19:47:00.000Z");
    assert.equal(overnight?.arrivalAt.toISOString(), "2026-08-16T00:19:00.000Z");
    assert.equal(overnight?.durationMinutes, 272);
  });

  it("counts a sleeper berth as bookable", () => {
    const trains = mapTcddResponse(fixture("tcdd-esk-ist"), {
      originCode: "ESK",
      destinationCode: "IST",
      date: QUERY_DATE,
    });
    const sleeper = trains.find((t) => t.trainNumber === "22001");
    // Y1 153 + B 8. Cabin class B is YATAKLI, a berth the pilot can absolutely book.
    assert.equal(sleeper?.availableSeats, 161);
    assert.equal(sleeper?.fares?.some((f) => f.code === "B"), true);
  });

  it("handles a train with only two segments", () => {
    const trains = mapTcddResponse(fixture("tcdd-esk-ist"), {
      originCode: "ESK",
      destinationCode: "IST",
      date: QUERY_DATE,
    });
    const short = trains.find((t) => t.trainNumber === "81001");
    assert.equal(short?.departureAt.toISOString(), "2026-08-15T04:18:00.000Z");
    assert.equal(short?.arrivalAt.toISOString(), "2026-08-15T07:07:00.000Z");
  });

  it("returns departures in time order", () => {
    const times = outbound().map((t) => t.departureAt.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  it("drops unreadable rows rather than losing the whole day", () => {
    const payload = {
      trainLegs: [
        {
          trainAvailabilities: [
            {
              trains: [
                { number: "no segments" },
                { number: "empty segments", segments: [] },
                {
                  number: "fine",
                  segments: [
                    { departureTime: 1786764600000, arrivalTime: 1786775100000 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    assert.deepEqual(
      mapTcddResponse(payload, MAP_OPTIONS).map((t) => t.trainNumber),
      ["fine"],
    );
  });

  it("returns nothing for a payload that isn't an availability response", () => {
    assert.deepEqual(mapTcddResponse({ error: "rate limited" }, MAP_OPTIONS), []);
    assert.deepEqual(mapTcddResponse(null, MAP_OPTIONS), []);
    assert.deepEqual(mapTcddResponse("<html>go away</html>", MAP_OPTIONS), []);
    assert.deepEqual(mapTcddResponse({ trainLegs: "nope" }, MAP_OPTIONS), []);
  });

  it("leaves seat and fare data undefined when the payload carries none", () => {
    const payload = {
      trainLegs: [
        {
          trainAvailabilities: [
            {
              trains: [
                {
                  number: "bare",
                  segments: [{ departureTime: 1786764600000, arrivalTime: 1786775100000 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const [train] = mapTcddResponse(payload, MAP_OPTIONS);
    assert.equal(train.fares, undefined);
    assert.equal(train.availableSeats, undefined);
    assert.equal(train.isSoldOut, undefined);
  });

  it("excludes exactly the wheelchair class", () => {
    assert.deepEqual([...EXCLUDED_CABIN_CODES], ["DSB"]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --import tsx --test src/lib/trains/tcddResponse.test.ts`
Expected: FAIL — `EXCLUDED_CABIN_CODES` is not exported, and the mapper returns `[]` for the fixtures because `findTrainArray` hands it leg objects with no `departureTime`.

- [ ] **Step 4: Rewrite the mapper**

In `src/lib/trains/tcddResponse.ts`: keep the file-level comment (updating its second paragraph, which claims the shape is unknown), keep `isJson`, and keep `parseTcddInstant` and its comment verbatim. Delete `pick`, `pickString`, `pickNumber`, `findTrainArray`, `mapFares`, `CLASS_NAME_KEYS`, `PRICE_KEYS`, `SEAT_KEYS`, `DAY_MS`, and the old `mapTcddResponse`. Add:

```ts
/**
 * Cabin classes a pilot cannot book.
 *
 * A denylist, not an allowlist: TCDD returns five cabin classes today (Y1 EKONOMİ, C BUSİNESS,
 * L LOCA, B YATAKLI, DSB TEKERLEKLİ SANDALYE) and may add more. An allowlist would silently drop
 * a new one — including, on the day it was written, the sleeper berth on the overnight service,
 * which is one of the better commutes on the route.
 *
 * This matters more than it looks: on a typical day most trains have sold out of everything
 * except DSB, so counting wheelchair spaces as availability would route the pilot onto a train
 * they cannot board.
 */
export const EXCLUDED_CABIN_CODES: readonly string[] = ["DSB"];

/** Every train in the payload, flattened out of the leg/availability nesting. */
function collectTrains(payload: unknown): Json[] {
  if (!isJson(payload)) return [];
  const legs = payload.trainLegs;
  if (!Array.isArray(legs)) return [];

  return legs.filter(isJson).flatMap((leg) => {
    const availabilities = leg.trainAvailabilities;
    if (!Array.isArray(availabilities)) return [];
    return availabilities.filter(isJson).flatMap((availability) => {
      const trains = availability.trains;
      return Array.isArray(trains) ? trains.filter(isJson) : [];
    });
  });
}

/** The cabin-class code on an entry that nests one, upper-cased. */
function cabinCodeOf(entry: Json): string | null {
  const cabin = entry.cabinClass;
  if (!isJson(cabin)) return null;
  const code = cabin.code;
  return typeof code === "string" && code !== "" ? code.toUpperCase() : null;
}

function cabinNameOf(entry: Json): string | undefined {
  const cabin = entry.cabinClass;
  if (!isJson(cabin)) return undefined;
  return typeof cabin.name === "string" && cabin.name !== "" ? cabin.name : undefined;
}

/**
 * One fare per cabin class, cheapest wins.
 *
 * Fares are nested under fare families (`STANDART`, and others TCDD may add), so the same cabin
 * can appear more than once at different prices. The pilot cares what the class costs, not which
 * family it came from.
 */
function mapFares(train: Json): TrainFare[] | undefined {
  const families = train.availableFareInfo;
  if (!Array.isArray(families)) return undefined;

  const byCode = new Map<string, TrainFare>();

  for (const family of families.filter(isJson)) {
    const classes = family.cabinClasses;
    if (!Array.isArray(classes)) continue;

    for (const entry of classes.filter(isJson)) {
      const code = cabinCodeOf(entry);
      const price = entry.minPrice;
      if (!code || typeof price !== "number" || !Number.isFinite(price)) continue;

      const fare: TrainFare = {
        code,
        className: cabinNameOf(entry) ?? code,
        // TCDD quotes major-unit TRY; stored as kuruş to stay integral.
        priceMinor: Math.round(price * 100),
        currency:
          typeof entry.minPriceCurrency === "string" ? entry.minPriceCurrency : "TRY",
        availableSeats:
          typeof entry.availabilityCount === "number" ? entry.availabilityCount : undefined,
      };

      const existing = byCode.get(code);
      if (!existing || fare.priceMinor < existing.priceMinor) byCode.set(code, fare);
    }
  }

  return byCode.size > 0 ? [...byCode.values()] : undefined;
}

/** Seats the pilot could actually buy, or undefined when TCDD reported no availability block. */
function bookableSeats(train: Json): number | undefined {
  const availabilities = train.cabinClassAvailabilities;
  if (!Array.isArray(availabilities)) return undefined;

  let total = 0;
  for (const entry of availabilities.filter(isJson)) {
    const code = cabinCodeOf(entry);
    if (code && EXCLUDED_CABIN_CODES.includes(code)) continue;
    const count = entry.availabilityCount;
    if (typeof count === "number" && Number.isFinite(count)) total += count;
  }
  return total;
}

export interface MapTcddOptions {
  originCode: string;
  destinationCode: string;
  /** The day that was queried — supplies the date when a timestamp only carries "HH:MM". */
  date: Date;
}

/**
 * Maps a TCDD availability payload to `TrainOption`s, dropping any train it can't read a
 * departure and arrival from. A partial timetable beats an exception: one malformed row
 * shouldn't cost the pilot the whole day's trains.
 */
export function mapTcddResponse(payload: unknown, options: MapTcddOptions): TrainOption[] {
  const { originCode, destinationCode, date } = options;

  return collectTrains(payload)
    .flatMap((train, index): TrainOption[] => {
      const segments = Array.isArray(train.segments) ? train.segments.filter(isJson) : [];
      if (segments.length === 0) return [];

      // A train carries every segment of its whole run, so arrival at *our* destination is the
      // last one's. `segments[0].arrivalTime` is the first intermediate stop, minutes away.
      const departureAt = parseTcddInstant(segments[0].departureTime, date);
      const arrivalAt = parseTcddInstant(segments[segments.length - 1].arrivalTime, date);
      if (!departureAt || !arrivalAt) return [];

      const fares = mapFares(train);
      const availableSeats = bookableSeats(train);
      const trainNumber =
        typeof train.number === "string" && train.number !== ""
          ? train.number
          : typeof train.commercialName === "string" && train.commercialName !== ""
            ? train.commercialName
            : `TCDD${String(index + 1).padStart(2, "0")}`;

      return [
        {
          trainNumber,
          originCode,
          destinationCode,
          departureAt,
          arrivalAt,
          durationMinutes: Math.round(
            (arrivalAt.getTime() - departureAt.getTime()) / 60_000,
          ),
          source: "live",
          providerTrainId: train.id === undefined || train.id === null ? undefined : String(train.id),
          fares,
          availableSeats,
          // `onSale: false` means TCDD isn't selling this train at all, whatever the counts say.
          isSoldOut:
            train.onSale === false
              ? true
              : availableSeats === undefined
                ? undefined
                : availableSeats <= 0,
        },
      ];
    })
    .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
}
```

Keep the existing imports of `buildTurkeyDate`, `TURKEY_UTC_OFFSET_MINUTES`, `TrainFare` and `TrainOption` — all four are still used.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/trains/tcddResponse.test.ts`
Expected: PASS. If `providerTrainId` mismatches on `81034`, read the real `id` out of the fixture and correct the assertion rather than the mapper.

- [ ] **Step 6: Commit**

```bash
git add src/lib/trains/tcddResponse.ts src/lib/trains/tcddResponse.test.ts src/lib/trains/TrainProvider.ts
git commit -m "Map the real TCDD availability payload, with cabin-class-aware seat counts"
```

---

### Task 6: Provider orchestration, live by default

**Files:**
- Modify: `src/lib/trains/TcddTrainProvider.ts` (substantial rewrite)
- Modify: `src/lib/trains/index.ts:1-16`
- Modify: `.env.example`
- Test: `src/lib/trains/TcddTrainProvider.test.ts` (create)

**Interfaces:**
- Consumes: `requestAvailability`, `formatTcddDate`, `TcddProviderError` (Task 3); `mapTcddResponse` (Task 5); `toTcddStation` (Task 1).
- Produces: `class TcddTrainProvider implements TrainProvider`, `interface TcddProviderConfig { baseUrl?: string; clientOptions?: TcddClientOptions }`, `readTcddConfigFromEnv(): TcddProviderConfig`. `TcddProviderError` is re-exported from here for existing importers.

**The gating change:** `readTcddConfigFromEnv` currently returns `null` when `TCDD_API_BASE_URL` is unset, and `index.ts` falls back to static-only. Now that the endpoint is known and needs no credential, it always returns a config. `FallbackTrainProvider` remains the safety net, so the degradation path is unchanged — it just stops being the permanent state.

- [ ] **Step 1: Write the failing test**

Create `src/lib/trains/TcddTrainProvider.test.ts`:

```ts
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { TcddTrainProvider } from "@/lib/trains/TcddTrainProvider";

const QUERY_DATE = buildTurkeyDate(2026, 7, 15, 9, 0);

/** A provider whose client call is replaced, so nothing touches the network. */
function providerWith(payload: unknown) {
  let calls = 0;
  const provider = new TcddTrainProvider({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (provider as any).fetchPayload = async () => {
    calls += 1;
    return payload;
  };
  return { provider, calls: () => calls };
}

const PAYLOAD = {
  trainLegs: [
    {
      trainAvailabilities: [
        {
          trains: [
            {
              number: "81034",
              segments: [{ departureTime: 1786764600000, arrivalTime: 1786775100000 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("TcddTrainProvider", () => {
  it("maps what the client returned", async () => {
    const { provider } = providerWith(PAYLOAD);
    const trains = await provider.searchTrains("IST", "ESK", QUERY_DATE);
    assert.equal(trains.length, 1);
    assert.equal(trains[0].trainNumber, "81034");
    assert.equal(trains[0].source, "live");
  });

  it("returns nothing without a request when a station is unmapped", async () => {
    const { provider, calls } = providerWith(PAYLOAD);
    assert.deepEqual(await provider.searchTrains("IST", "XXX", QUERY_DATE), []);
    assert.equal(calls(), 0, "an unmapped station is our gap, not worth a request");
  });

  it("caches per route and Türkiye-local date", async () => {
    const { provider, calls } = providerWith(PAYLOAD);
    await provider.searchTrains("IST", "ESK", QUERY_DATE);
    await provider.searchTrains("IST", "ESK", buildTurkeyDate(2026, 7, 15, 21, 0));
    assert.equal(calls(), 1, "same Türkiye day should hit the cache");

    await provider.searchTrains("IST", "ESK", buildTurkeyDate(2026, 7, 16, 9, 0));
    assert.equal(calls(), 2, "a different day is a different request");
  });

  it("still serves destinations from the curated route list", () => {
    const { provider } = providerWith(PAYLOAD);
    const codes = provider.listDestinationsFromIstanbul().map((s) => s.code);
    assert.ok(codes.includes("ESK"));
  });
});
```

Note: the cache is `globalThis`-pinned and shared across tests in a file, so each test above uses a distinct route/date combination or asserts on call counts from a fresh key. If you hit cross-test bleed, give each test its own destination code rather than clearing the cache.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/trains/TcddTrainProvider.test.ts`
Expected: FAIL — the constructor still requires `baseUrl`, and `fetchPayload` does not exist.

- [ ] **Step 3: Rewrite the provider**

Replace `src/lib/trains/TcddTrainProvider.ts` entirely:

```ts
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
import { TURKEY_UTC_OFFSET_MINUTES } from "@/lib/time/turkeyTime";

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

/** Türkiye-local calendar date, "YYYY-MM-DD" — the cache key. */
function turkeyDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
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
    if (cached && cached.expiresAt > Date.now()) return cached.options;

    const payload = await this.fetchPayload(origin, destination, date);
    const options = mapTcddResponse(payload, { originCode, destinationCode, date });

    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, options });
    return options;
  }
}
```

- [ ] **Step 4: Wire it up as the default**

Replace lines 1-16 of `src/lib/trains/index.ts`:

```ts
import { StaticTrainProvider } from "@/lib/trains/StaticTrainProvider";
import { FallbackTrainProvider } from "@/lib/trains/FallbackTrainProvider";
import { TcddTrainProvider, readTcddConfigFromEnv } from "@/lib/trains/TcddTrainProvider";
import type { TrainProvider } from "@/lib/trains/TrainProvider";

const staticProvider = new StaticTrainProvider();

/**
 * Live TCDD data, with the curated timetable standing by.
 *
 * The live path needs no credential and no configuration — the endpoint is known and the token is
 * scraped at runtime — so it is on by default. It is also unofficial and may fail at any time,
 * which is exactly what `FallbackTrainProvider` is for: a failed request degrades to estimates,
 * and the `source` on each `TrainOption` tells the UI which one answered.
 */
export const trainProvider: TrainProvider = new FallbackTrainProvider(
  new TcddTrainProvider(readTcddConfigFromEnv()),
  staticProvider,
);
```

- [ ] **Step 5: Update `.env.example`**

Replace the TCDD block in `.env.example` with:

```
# Live TCDD timetable. On by default — the endpoint is known and needs no credential, so there is
# nothing to fill in here. If TCDD is unreachable the app degrades to the curated timetable in
# src/lib/trains/data/ and labels those times as estimates.

# Overrides the built-in API base. Only needed to point at a proxy or a mock.
TCDD_API_BASE_URL=""

# JSON overriding the built-in station mapping, e.g. {"IST":{"id":1325,"name":"İSTANBUL(SÖĞÜTLÜÇEŞME)"}}.
TCDD_STATION_IDS=""

# Overrides the built-in ebilet deep link. The default prefills the trip on ebilet's own
# /sefer-listesi-yonlendirme route; set this only if TCDD changes that format.
# Placeholders: {fromId} {toId} (numeric ids), {from} {to} (names), {date} (YYYY-MM-DD),
# {time} (HH:MM local).
TCDD_BOOKING_URL_TEMPLATE=""
```

`TCDD_API_TOKEN` and `TCDD_API_SEARCH_PATH` are gone — there is no token to supply and the path is fixed. Remove them.

- [ ] **Step 6: Run the full suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all PASS. `FallbackTrainProvider.test.ts` must pass **untouched** — if it does not, the provider seam has been broken and that is the thing to fix, not the test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/trains/TcddTrainProvider.ts src/lib/trains/TcddTrainProvider.test.ts src/lib/trains/index.ts .env.example
git commit -m "Turn the live TCDD provider on by default"
```

---

### Task 7: The ebilet deep link

**Files:**
- Modify: `src/lib/trains/booking.ts`
- Modify: `src/lib/trains/booking.test.ts`
- Modify: `CLAUDE.md` (the two claims this work disproves)

**Interfaces:**
- Consumes: `toTcddStation` (Task 1).
- Produces: `buildBookingUrl(option, template?): string`, `EBILET_SEARCH_URL`, `EBILET_DEFAULT_TEMPLATE`.

**Where this came from:** the params are read by the `SeferListRedirect` component in ebilet's lazily-loaded `4696.*.chunk.js` — which is why an initial-bundle scan misses them and CLAUDE.md concluded they were undiscoverable. It reads exactly six: `binisIstasyonId`, `inisIstasyonId`, `gidisTarih`, `donusTarih`, `seyahatTuru`, `yolcuSayisi`.

**Still unverified:** this is the one part of the spec not confirmed by execution. ebilet is an SPA, so a server-side fetch returns only the shell and the link cannot be exercised from the terminal. **Open the URL from Step 5 in a real browser before considering this task done.** If it does not land on a prefilled search, keep `EBILET_DEFAULT_TEMPLATE` undefined so links fall back to the plain search page, and say so in the commit.

- [ ] **Step 1: Write the failing test**

Replace the body of `src/lib/trains/booking.test.ts` with tests covering the new default (keep the existing file's TZ handling if it has any):

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
    // 1 = one way. 0 would be a round trip and require donusTarih.
    assert.equal(url.searchParams.get("seyahatTuru"), "1");
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
    assert.equal(buildBookingUrl(OPTION, "not a url {fromId}"), EBILET_SEARCH_URL);
  });
});
```

The percent-encoded station name in the last test is `encodeURIComponent("İSTANBUL(SÖĞÜTLÜÇEŞME)")`, verified — the dotted capital İ is `%C4%B0`, and the parentheses are left unencoded by `encodeURIComponent`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/trains/booking.test.ts`
Expected: FAIL — with no `TCDD_BOOKING_URL_TEMPLATE` set, `buildBookingUrl` still returns the bare search page.

- [ ] **Step 3: Implement the default link**

In `src/lib/trains/booking.ts`, replace the file-level comment's second paragraph and the function:

```ts
/**
 * The trip prefilled on ebilet's own redirect route.
 *
 * These parameter names are not documented; they were read off the `SeferListRedirect` component
 * in ebilet's lazily-loaded `4696.*.chunk.js`, which parses exactly six query variables and pushes
 * the resulting search into the app's store. A scan of the initial bundle misses this file
 * entirely, which is why the format was long assumed undiscoverable.
 *
 * `seyahatTuru=1` is one-way; `0` means round trip and additionally reads `donusTarih`.
 */
export const EBILET_DEFAULT_TEMPLATE =
  "https://ebilet.tcddtasimacilik.gov.tr/sefer-listesi-yonlendirme" +
  "?binisIstasyonId={fromId}&inisIstasyonId={toId}&gidisTarih={date}" +
  "&yolcuSayisi=1&seyahatTuru=1";

/**
 * Where to send the pilot to buy this train. Falls back to the bare search page whenever the
 * link can't be built accurately — a correct page they must search on beats a prefilled one
 * pointing somewhere else.
 */
export function buildBookingUrl(
  option: Pick<TrainOption, "originCode" | "destinationCode" | "departureAt">,
  template: string | undefined = process.env.TCDD_BOOKING_URL_TEMPLATE ||
    EBILET_DEFAULT_TEMPLATE,
): string {
  if (!template) return EBILET_SEARCH_URL;

  const from = toTcddStation(option.originCode);
  const to = toTcddStation(option.destinationCode);
  if (!from || !to) return EBILET_SEARCH_URL;

  const replacements: Record<string, string> = {
    "{fromId}": String(from.id),
    "{toId}": String(to.id),
    "{from}": encodeURIComponent(from.name),
    "{to}": encodeURIComponent(to.name),
    "{date}": turkeyDateKey(option.departureAt),
    "{time}": formatTurkeyTime(option.departureAt),
  };

  const url = Object.entries(replacements).reduce(
    (acc, [placeholder, value]) => acc.split(placeholder).join(value),
    template,
  );

  // A malformed template shouldn't render a dead link in the UI.
  try {
    return new URL(url).toString();
  } catch {
    console.warn("[trains] TCDD_BOOKING_URL_TEMPLATE did not produce a valid URL.");
    return EBILET_SEARCH_URL;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/trains/booking.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the link in a real browser**

Open:

```
https://ebilet.tcddtasimacilik.gov.tr/sefer-listesi-yonlendirme?binisIstasyonId=1325&inisIstasyonId=93&gidisTarih=2026-08-15&yolcuSayisi=1&seyahatTuru=1
```

Expected: ebilet lands on its trip list with İstanbul(Söğütlüçeşme) → Eskişehir for 15 Aug 2026 already searched.

If it does not, set `EBILET_DEFAULT_TEMPLATE` to `undefined`, revert the default in the signature to `process.env.TCDD_BOOKING_URL_TEMPLATE`, and record what the page actually did.

- [ ] **Step 6: Correct CLAUDE.md**

Two claims in CLAUDE.md are now disproved by this work. Update the "Trains" section:

- The bullet saying the ebilet deep-link params "cannot be discovered from code — they have to be read off a real search in a browser" — replace with the chunk-file explanation and the six parameter names.
- The line describing `TcddTrainProvider` as "Active only when `TCDD_API_BASE_URL` is set" — it is now on by default.

Also add to the Privacy section, so the fixtures do not read as a violation:

```markdown
Timetable responses are the one exception: `src/lib/trains/__fixtures__/` holds real TCDD
availability payloads, which contain public departure data and no passenger information. See the
README there.
```

- [ ] **Step 7: Full verification and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all PASS.

```bash
git add src/lib/trains/booking.ts src/lib/trains/booking.test.ts CLAUDE.md
git commit -m "Prefill the trip on ebilet instead of linking to a blank search"
```

---

## Done when

- `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` all pass.
- `FallbackTrainProvider.test.ts` passes without having been edited.
- A roster uploaded locally shows train times labelled live rather than estimates, and the "Buy on TCDD" link lands on a prefilled ebilet search.
- Pulling the network (or pointing `TCDD_API_BASE_URL` at a dead host) still renders the window page, with times labelled as estimates.
