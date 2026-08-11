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
