process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";
import { resetTcddToken, TcddAuthError } from "@/lib/trains/tcddAuth";
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

  /**
   * Pinned as literals, not derived from `BROWSER_HEADERS`. Iterating that object's own keys only
   * proves the spread happened: deleting `unit-id` or `sec-fetch-site` from it would shrink both
   * sides of the comparison and still pass — which is precisely the regression the comment above
   * `BROWSER_HEADERS` warns about, since the WAF answers 403 without them.
   */
  const REQUIRED_WAF_HEADERS = [
    "Accept",
    "Accept-Language",
    "Content-Type",
    "Origin",
    "Referer",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "unit-id",
    "User-Agent",
  ];

  it("sends the browser headers the WAF requires, and a bare Authorization", async () => {
    const { fetchImpl, calls } = stubFetch([json({ trainLegs: [] })]);

    await requestAvailability(IST, ESK, "15-08-2026 00:00:00", options(fetchImpl));

    const post = calls.find((c) => c.url.startsWith(BASE));
    const headers = post?.init?.headers as Record<string, string>;
    for (const key of REQUIRED_WAF_HEADERS) {
      assert.ok(BROWSER_HEADERS[key], `BROWSER_HEADERS no longer defines ${key}`);
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

  it("turns a failed token scrape into TcddProviderError, keeping the cause", async () => {
    // This module's contract is that *every* failure path surfaces as `TcddProviderError`. An
    // auth failure is the commonest one there is, so a caller branching on the class must not
    // see `TcddAuthError` leak through.
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url === SITE) return new Response("<html>maintenance</html>", { status: 200 });
      throw new Error("should not have reached the API without a token");
    }) as unknown as typeof fetch;

    await assert.rejects(
      () => requestAvailability(IST, ESK, "15-08-2026 00:00:00", options(fetchImpl)),
      (error: unknown) => {
        assert.ok(error instanceof TcddProviderError, `got ${(error as Error)?.name}`);
        assert.ok(
          (error as Error).cause instanceof TcddAuthError,
          "the scrape failure must survive as `cause` or it is undebuggable",
        );
        return true;
      },
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
