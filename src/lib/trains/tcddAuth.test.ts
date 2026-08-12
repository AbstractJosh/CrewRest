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

  it("takes the last token in a bundle, not the first", async () => {
    // Minified bundles can carry more than one; the site sends the last. No fixture puts two in
    // one file, so a regression to `found[0]` would otherwise pass.
    const STALE = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIi." + "b".repeat(40) + ".old";
    const { fetchImpl } = stubFetch({
      [SITE]: `<script src="/js/index~abc.deadbeef.js"></script>`,
      [`${SITE}/js/index~abc.deadbeef.js`]: `var a="${STALE}";var b="${TOKEN}";`,
    });

    assert.equal(await getTcddToken({ fetchImpl, siteUrl: SITE }), TOKEN);
  });
});

/**
 * The window page runs two `searchTrainsInWindow` calls concurrently and each batches three days,
 * so a cold process can reach `getTcddToken` six times at once. Without an in-flight guard that is
 * six full scrapes of ebilet's HTML plus its bundles — against a WAF-protected unofficial endpoint,
 * the traffic pattern most likely to get us blocked.
 */
describe("getTcddToken concurrency", () => {
  const PAGES = {
    [SITE]: `<script src="/js/index~abc.deadbeef.js"></script>`,
    [`${SITE}/js/index~abc.deadbeef.js`]: TOKEN,
  };

  it("scrapes once for concurrent callers and hands them all the same token", async () => {
    const { fetchImpl, calls } = stubFetch(PAGES);

    const tokens = await Promise.all(
      Array.from({ length: 6 }, () => getTcddToken({ fetchImpl, siteUrl: SITE })),
    );

    assert.deepEqual(tokens, Array.from({ length: 6 }, () => TOKEN));
    // One page fetch plus one bundle fetch. Six unguarded callers would make twelve.
    assert.equal(calls.length, 2, `expected a single scrape, got ${calls.join(", ")}`);
  });

  it("scrapes again after a reset, so a 401 mid-batch is not permanently cached", async () => {
    const { fetchImpl, calls } = stubFetch(PAGES);

    await getTcddToken({ fetchImpl, siteUrl: SITE });
    resetTcddToken();
    await getTcddToken({ fetchImpl, siteUrl: SITE });

    assert.equal(calls.length, 4);
  });

  it("does not wedge the provider when a scrape fails", async () => {
    // A cached *rejected* promise would keep failing until the process restarts, which is worse
    // than the fan-out being fixed.
    const broken = stubFetch({ [SITE]: "<html>maintenance</html>" });
    await assert.rejects(
      () => getTcddToken({ fetchImpl: broken.fetchImpl, siteUrl: SITE }),
      TcddAuthError,
    );

    const working = stubFetch(PAGES);
    assert.equal(await getTcddToken({ fetchImpl: working.fetchImpl, siteUrl: SITE }), TOKEN);
  });
});
