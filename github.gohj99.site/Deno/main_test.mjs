import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

if (!globalThis.Deno) {
  globalThis.Deno = {
    readTextFile: (url) => readFile(url, "utf8"),
  };
}

const { handler } = await import("./main.js");
const realFetch = globalThis.fetch;

function mockFetch(implementation) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return implementation(url, init);
  };
  return calls;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.caches;
});

test("maps proxy hosts and routes Gist raw requests", async () => {
  const calls = mockFetch(() =>
    new Response("ok", {
      headers: { "content-type": "text/plain", "content-length": "2" },
    })
  );

  assert.equal((await handler(new Request("https://api.github.gohj99.site/repos/x"))).status, 200);
  assert.equal(calls.at(-1).url, "https://api.github.com/repos/x");
  assert.equal(
    (await handler(new Request("https://gist.github.gohj99.site/u/id/raw/file"))).status,
    200,
  );
  assert.equal(calls.at(-1).url, "https://gist.githubusercontent.com/u/id/raw/file");
});

test("rewrites streamed HTML, response links, SRI, and injects the local hook", async () => {
  mockFetch(() =>
    new Response(
      '<html><head><script integrity="sha256-old" src="https://github.githubassets.com/a.js"></script></head><body>https://api.github.com/x</body>',
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          location: "https://github.com/owner/repo",
        },
      },
    )
  );

  const response = await handler(new Request("https://github.gohj99.site/owner/repo"));
  const body = await response.text();
  assert.match(body, /<head><script src="\/static\/github-hook\.js"><\/script>/);
  assert.ok(!body.includes("integrity="));
  assert.ok(body.includes("https://assets.github.gohj99.site/a.js"));
  assert.ok(body.includes("https://api.github.gohj99.site/x"));
  assert.equal(response.headers.get("location"), "https://github.gohj99.site/owner/repo");
  assert.equal(response.headers.get("content-length"), null);
});

test("keeps credentials scoped to API and GHCR", async () => {
  const calls = mockFetch(() =>
    new Response("{}", {
      headers: { "content-type": "application/json" },
    })
  );
  const headers = {
    authorization: "Bearer token",
    cookie: "session=secret",
    origin: "https://github.gohj99.site",
    referer: "https://github.gohj99.site/owner/repo",
  };

  await handler(new Request("https://raw.github.gohj99.site/file", { headers }));
  assert.equal(calls.at(-1).init.headers.get("authorization"), null);
  assert.equal(calls.at(-1).init.headers.get("cookie"), null);

  await handler(new Request("https://api.github.gohj99.site/user", { headers }));
  assert.equal(calls.at(-1).init.headers.get("authorization"), "Bearer token");
  assert.equal(calls.at(-1).init.headers.get("cookie"), "session=secret");
  assert.equal(calls.at(-1).init.headers.get("origin"), "https://github.com");
  assert.equal(calls.at(-1).init.headers.get("referer"), "https://github.com/owner/repo");
  const apiResponse = await handler(new Request("https://api.github.gohj99.site/public"));
  assert.equal(apiResponse.headers.get("deno-cdn-cache-control"), "public, s-maxage=600");
  assert.match(apiResponse.headers.get("vary"), /Authorization/);
  assert.match(apiResponse.headers.get("vary"), /Cookie/);

  const ghcrResponse = await handler(
    new Request("https://ghcr.github.gohj99.site/v2/x", { headers }),
  );
  assert.equal(calls.at(-1).init.headers.get("authorization"), "Bearer token");
  assert.equal(calls.at(-1).init.headers.get("cookie"), null);
  assert.equal(ghcrResponse.headers.get("cache-control"), "private, no-store");
  assert.equal(ghcrResponse.headers.get("deno-cdn-cache-control"), "private, no-store");
  assert.match(ghcrResponse.headers.get("vary"), /Authorization/);
});

test("handles smart redirects, denied paths, unknown hosts, and local files", async () => {
  const calls = mockFetch(() => {
    throw new Error("upstream must not be called");
  });

  const redirect = await handler(
    new Request(
      "https://github.gohj99.site/https://github.com/denoland/deno?tab=readme",
    ),
  );
  assert.equal(redirect.status, 301);
  assert.equal(
    redirect.headers.get("location"),
    "https://github.gohj99.site/denoland/deno?tab=readme",
  );
  assert.equal(
    (await handler(new Request("https://github.gohj99.site/%2egit/config"))).status,
    404,
  );
  assert.equal((await handler(new Request("https://example.com/"))).status, 404);

  const robots = await handler(new Request("https://github.gohj99.site/robots.txt"));
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /GPTBot/);
  const hook = await handler(new Request("https://github.gohj99.site/static/github-hook.js"));
  assert.equal(hook.status, 200);
  assert.match(await hook.text(), /GitHub Proxy/);
  assert.equal(calls.length, 0);
});

test("does not rewrite binary, attachment, Range, or GHCR bodies", async () => {
  const bytes = new TextEncoder().encode("github.com\0raw");
  const cases = [
    ["https://github.gohj99.site/file", { "content-type": "application/octet-stream" }, {}],
    ["https://github.gohj99.site/file", {
      "content-type": "application/javascript",
      "content-disposition": "attachment; filename=x.js",
    }, {}],
    ["https://github.gohj99.site/file", {
      "content-type": "text/html",
      "content-range": "bytes 0-13/50",
    }, { range: "bytes=0-13" }],
    ["https://ghcr.github.gohj99.site/v2/x", { "content-type": "application/json" }, {}],
  ];
  for (const [url, responseHeaders, requestHeaders] of cases) {
    mockFetch(() =>
      new Response(bytes, {
        status: responseHeaders["content-range"] ? 206 : 200,
        headers: responseHeaders,
      })
    );
    const response = await handler(new Request(url, { headers: requestHeaders }));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  }
});
