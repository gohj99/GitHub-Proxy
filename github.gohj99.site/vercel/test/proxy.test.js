import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";

import handler from "../api/proxy.js";

const encoder = new TextEncoder();
const main = "https://github.gohj99.site";
const pairs = [
  ["", "github.com"], ["api", "api.github.com"], ["raw", "raw.githubusercontent.com"],
  ["camo", "camo.githubusercontent.com"], ["docs", "docs.github.com"], ["gist", "gist.github.com"],
  ["assets", "github.githubassets.com"], ["avatars", "avatars.githubusercontent.com"],
  ["objects", "objects.githubusercontent.com"], ["codeload", "codeload.github.com"], ["ghcr", "ghcr.io"],
  ...["gist-assets", "user-images", "private-user-images", "release-assets", "github-releases"]
    .map((key) => [key, `${key}.githubusercontent.com`]),
];

function proxyHost(key) {
  return (key ? key + "." : "") + "github.gohj99.site";
}

function fixture(body = "ok", headers = {}, status = 200) {
  const length = typeof body === "string" ? Buffer.byteLength(body) : body?.byteLength || 0;
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain", "content-length": String(length), ...headers },
  });
}

function chunked(bytes, size = 7) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

async function run(fetcher, url, init) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (target, options) => {
    calls.push({ url: String(target), init: options });
    return fetcher(target, options);
  };
  try {
    const response = await handler(new Request(url, init));
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { response, bytes, text: new TextDecoder().decode(bytes), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("maps every proxy host to the intended HTTPS upstream", async () => {
  for (const [key, upstream] of pairs) {
    const result = await run(() => fixture(), `https://${proxyHost(key)}/owner/repo?q=1`);
    assert.equal(new URL(result.calls[0].url).hostname, upstream);
    assert.equal(new URL(result.calls[0].url).pathname, "/owner/repo");
    assert.equal(new URL(result.calls[0].url).search, "?q=1");
  }
});

test("maps the direct Vercel function endpoint to the upstream root", async () => {
  const result = await run(() => fixture(), "https://docs.github.gohj99.site/api/proxy");
  const upstream = new URL(result.calls[0].url);
  assert.equal(upstream.href, "https://docs.github.com/");
});

test("routes gist raw URLs to gist.githubusercontent.com", async () => {
  const result = await run(() => fixture(), "https://gist.github.gohj99.site/user/id/raw/rev/file.js");
  assert.equal(new URL(result.calls[0].url).hostname, "gist.githubusercontent.com");
});

test("preserves smart redirect queries and rejects unapproved targets", async () => {
  const redirected = await run(() => fixture(), `${main}/https://github.com/u/r?x=a%2Fb&x=two+words`);
  assert.equal(redirected.response.status, 301);
  assert.equal(redirected.response.headers.get("location"), "https://github.gohj99.site/u/r?x=a%2Fb&x=two+words");
  assert.equal(redirected.calls.length, 0);

  const rejected = await run(() => fixture(), `${main}/https://github.com.evil/x`);
  assert.equal(rejected.response.status, 404);
  assert.equal(rejected.calls.length, 0);
});

test("normalizes and blocks protected paths before fetching", async () => {
  for (const path of ["/.git/config", "/%2egit/config", "/%6cogin", "//login", "/proxy_cache_dir/x", "/.well-known/file.js"]) {
    const result = await run(() => fixture(), main + path);
    assert.ok([403, 404].includes(result.response.status), path);
    assert.equal(result.calls.length, 0, path);
  }
  assert.equal((await run(() => fixture(), main + "/%bad")).response.status, 400);
  assert.equal((await run(() => fixture(), "https://unknown.example/x")).response.status, 404);
});

test("forwards credentials only to API and GHCR according to policy", async () => {
  for (const key of ["", "api", "ghcr", "raw"]) {
    const result = await run(() => fixture(), `https://${proxyHost(key)}/graphql`, {
      method: "POST",
      body: '{"query":"ok"}',
      headers: {
        authorization: "Bearer example",
        cookie: "session=example",
        origin: main,
        referer: main + "/owner/repo",
        "content-type": "application/json",
        "x-vercel-deployment-url": "internal.vercel.app",
        "x-vercel-oidc-token": "secret-platform-token",
      },
    });
    const headers = result.calls[0].init.headers;
    assert.equal(headers.get("authorization"), ["api", "ghcr"].includes(key) ? "Bearer example" : null);
    assert.equal(headers.get("cookie"), key === "api" ? "session=example" : null);
    assert.equal(headers.get("origin"), "https://github.com");
    assert.equal(headers.get("referer"), "https://github.com/owner/repo");
    assert.equal(headers.get("x-vercel-deployment-url"), null);
    assert.equal(headers.get("x-vercel-oidc-token"), null);
  }
});

test("streams HTML rewrites across chunks and removes stale integrity metadata", async () => {
  const originals = pairs.map(([, host]) => `https://${host}/x`).join(" ");
  const input = `<html><head><link integrity="sha256-old" href="https://github.githubassets.com/x.css"></head><body>${originals} github.com.evil 中文</body>`;
  const result = await run(() => new Response(chunked(encoder.encode(input), 3), {
    headers: { "content-type": "text/html; charset=utf-8", etag: '"origin"' },
  }), main + "/owner/repo");

  for (const [key] of pairs) assert.ok(result.text.includes(`https://${proxyHost(key)}/x`));
  assert.match(result.text, /<head><script src="\/static\/github-hook\.js"><\/script>/);
  assert.ok(!result.text.includes("integrity="));
  assert.ok(result.text.includes("github.com.evil 中文"));
  assert.equal(result.response.headers.get("etag"), null);
  assert.equal(result.response.headers.get("content-length"), null);
});

test("decompresses gzip text before rewriting", async () => {
  const compressed = gzipSync("<html><head></head><body>https://github.com/x</body>");
  const result = await run(() => fixture(compressed, {
    "content-type": "text/html",
    "content-encoding": "gzip",
  }), main + "/x");
  assert.ok(result.text.includes("https://github.gohj99.site/x"));
  assert.equal(result.response.headers.get("content-encoding"), null);
});

test("keeps binary, attachment, range and GHCR response bytes unchanged", async () => {
  const bytes = encoder.encode("github.com\0\ufffd");
  const cases = [
    [main, { "content-type": "application/octet-stream" }, 200, {}],
    [main, { "content-type": "application/javascript", "content-disposition": "attachment; filename=x.js" }, 200, {}],
    ["https://ghcr.github.gohj99.site", { "content-type": "application/json" }, 200, {}],
    [main, { "content-type": "text/html", "content-range": "bytes 0-14/100" }, 206, { headers: { range: "bytes=0-14" } }],
  ];
  for (const [host, headers, status, init] of cases) {
    const result = await run(() => fixture(bytes, headers, status), host + "/file", init);
    assert.deepEqual(result.bytes, bytes);
    assert.equal(result.response.status, status);
  }
});

test("rewrites redirect, CORS, Link, Refresh and GHCR realm headers", async () => {
  const result = await run(() => fixture(null, {
    location: "//release-assets.githubusercontent.com/file?jwt=a%2Fb&x=+",
    refresh: '0; url="http://github.com/owner/repo"',
    link: '<https://api.github.com/x?page=2>; rel="next"',
    "access-control-allow-origin": "https://github.com",
    "www-authenticate": 'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:u/r:pull"',
  }, 302), main + "/file");

  assert.equal(result.response.headers.get("location"), "https://release-assets.github.gohj99.site/file?jwt=a%2Fb&x=+");
  assert.equal(result.response.headers.get("refresh"), '0; url="https://github.gohj99.site/owner/repo"');
  assert.equal(result.response.headers.get("access-control-allow-origin"), main);
  assert.ok(result.response.headers.get("link").includes("api.github.gohj99.site"));
  assert.equal(result.response.headers.get("www-authenticate"), 'Bearer realm="https://ghcr.github.gohj99.site/token",service="ghcr.io",scope="repository:u/r:pull"');
});

test("sets Vercel CDN caching only for bounded public responses", async () => {
  const publicResult = await run(() => fixture("ok"), main + "/x");
  assert.equal(publicResult.response.headers.get("vercel-cdn-cache-control"), "public, s-maxage=600");

  for (const [url, init] of [
    ["https://api.github.gohj99.site/x", {}],
    ["https://api.github.gohj99.site/x", { headers: { authorization: "Bearer private" } }],
    ["https://ghcr.github.gohj99.site/v2/x", {}],
    ["https://objects.github.gohj99.site/file?X-Amz-Signature=secret", {}],
    ["https://gist.github.gohj99.site/user/id", {}],
    [main + "/file", { headers: { range: "bytes=0-5" } }],
  ]) {
    const result = await run(() => fixture(), url, init);
    assert.equal(result.response.headers.get("vercel-cdn-cache-control"), "no-store");
    assert.equal(result.response.headers.get("cache-control"), "private, no-store");
  }

  const privateResult = await run(() => fixture("ok", { "cache-control": "private" }), main + "/x");
  assert.equal(privateResult.response.headers.get("vercel-cdn-cache-control"), "no-store");
});

test("turns upstream failures into a non-cacheable 502", async () => {
  const result = await run(() => { throw new TypeError("Connection failed"); }, main + "/x");
  assert.equal(result.response.status, 502);
  assert.equal(result.response.headers.get("cache-control"), "private, no-store");
  assert.equal(result.response.headers.get("vercel-cdn-cache-control"), "no-store");
});
