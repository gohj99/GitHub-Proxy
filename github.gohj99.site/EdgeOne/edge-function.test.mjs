import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { gzipSync } from "node:zlib";

const root = new URL("./", import.meta.url);
const source = await readFile(new URL("edge-function.js", root), "utf8");
const encoder = new TextEncoder();
const main = "https://github.gohj99.site";
const pairs = [
  ["", "github.com"], ["api", "api.github.com"], ["raw", "raw.githubusercontent.com"],
  ["camo", "camo.githubusercontent.com"], ["docs", "docs.github.com"], ["gist", "gist.github.com"],
  ["assets", "github.githubassets.com"], ["avatars", "avatars.githubusercontent.com"],
  ["objects", "objects.githubusercontent.com"], ["codeload", "codeload.github.com"], ["ghcr", "ghcr.io"],
  ...["gist-assets", "user-images", "private-user-images", "release-assets", "github-releases"].map((key) => [key, `${key}.githubusercontent.com`]),
];
const proxyHost = (key) => (key ? key + "." : "") + "github.gohj99.site";

function fixture(body = "ok", headers = {}, status = 200) {
  return new Response(body, { status, headers: {
    "content-type": "text/plain", "content-length": String(typeof body === "string" ? Buffer.byteLength(body) : body?.byteLength || 0), ...headers,
  } });
}

function chunks(bytes, size = 1024) {
  let offset = 0;
  return new ReadableStream({ pull(controller) {
    if (offset >= bytes.length) return controller.close();
    controller.enqueue(bytes.slice(offset, offset + size));
    offset += size;
  } });
}

function harness(fetcher = () => fixture(), { cacheFailure = false, live = false } = {}) {
  const calls = [];
  const stores = new Map();
  const cacheReads = [];
  const cacheWrites = [];
  let listener;
  const context = vm.createContext({
    URL, Headers, Request, Response, TextEncoder, TextDecoder, Uint8Array, atob, DecompressionStream,
    // Model EdgeOne's restrictions instead of relying on Node-only streams.
    ReadableStream: class { constructor() { throw new Error("EdgeOne cannot construct ReadableStream"); } },
    TransformStream: class extends TransformStream { constructor(transformer) { assert.equal(transformer, undefined); super(); } },
    console: { error() {} },
    caches: { async open(namespace) {
      if (!stores.has(namespace)) stores.set(namespace, new Map());
      const store = stores.get(namespace);
      return {
        async match(key) {
          cacheReads.push([namespace, key.url]);
          if (cacheFailure) throw new Error("504 expired");
          const entry = store.get(key.url);
          if (!entry) return undefined;
          for (const name of (entry.response.headers.get("vary") || "").split(",").filter(Boolean)) {
            if (entry.request.headers.get(name.trim()) !== key.headers.get(name.trim())) return undefined;
          }
          return new Response(entry.bytes, entry.response);
        },
        async put(key, response) {
          assert.equal(key.method, "GET");
          assert.notEqual(response.status, 206);
          cacheWrites.push([namespace, key.url, response.headers.get("cache-control")]);
          if (cacheFailure) throw new Error("Cache unavailable");
          store.set(key.url, { request: key, bytes: await response.arrayBuffer(), response });
        },
      };
    } },
    async fetch(url, init) {
      calls.push({ url, init });
      const response = await fetcher(url, init);
      // None of the function's upstream reads may use the 1 MB body helpers.
      if (!live) response.text = response.arrayBuffer = () => { throw new Error("Use streaming in EdgeOne"); };
      return response;
    },
    addEventListener(type, callback) { assert.equal(type, "fetch"); assert.equal(listener, undefined); listener = callback; },
  });
  vm.runInContext(source, context);
  async function dispatch(url, init = {}) {
    const request = new Request(url, init);
    Object.defineProperty(request, "eo", { value: { clientIp: "203.0.113.4" } });
    const tasks = [];
    let result;
    let claimed = false;
    listener({ request, waitUntil(task) { tasks.push(task); }, respondWith(response) { assert.equal(claimed, false); claimed = true; result = response; } });
    if (!claimed) return { passthrough: true };
    const response = await result;
    const bytes = new Uint8Array(await response.arrayBuffer());
    await Promise.all(tasks);
    return { response, bytes, text: new TextDecoder().decode(bytes) };
  }
  return { dispatch, calls, cacheReads, cacheWrites };
}

test("all configured proxy hosts use the correct HTTPS upstream, Host, and unchanged query", async () => {
  const h = harness();
  for (const [key, upstream] of pairs) {
    const path = "/owner/repo?X-Amz-Signature=a%2Fb%2Bc&v=1&v=2";
    const { response } = await h.dispatch(`https://${proxyHost(key)}${path}`);
    assert.equal(response.status, 200);
    const { url, init } = h.calls.at(-1);
    assert.equal(url, `https://${upstream}${path}`);
    assert.equal(init.headers.get("host"), upstream);
    assert.equal(init.headers.get("accept-encoding"), "identity");
    assert.equal(init.headers.get("x-real-ip"), "203.0.113.4");
    assert.equal(init.redirect, "manual");
  }
  await h.dispatch("https://gist.github.gohj99.site/user/id/raw/rev/file.js");
  assert.equal(h.calls.at(-1).init.headers.get("host"), "gist.githubusercontent.com");
  assert.match(h.calls.at(-1).url, /^https:\/\/gist\.githubusercontent\.com\//);
  await h.dispatch(main + "//evil.example/file");
  assert.equal(new URL(h.calls.at(-1).url).hostname, "github.com");
});

test("smart redirects are allowlisted and keep signed queries byte-for-byte", async () => {
  const h = harness();
  for (const [key, host] of pairs) {
    for (const protocol of ["https://", "http:/"]) {
      const { response } = await h.dispatch(`${main}/${protocol}${host}/u/r?x=a%2Fb&x=two+words`);
      assert.equal(response.status, 301);
      assert.equal(response.headers.get("location"), `https://${proxyHost(key)}/u/r?x=a%2Fb&x=two+words`);
    }
  }
  for (const path of ["/https://evil.example/x", "/https://github.com.evil/x", "/https://github.com@evil.example/x", "/https://github.com:81/x"]) {
    assert.equal((await h.dispatch(main + path)).response.status, 404);
  }
  assert.equal(h.calls.length, 0);
});

test("Nginx path denials, decoding, ACME priority, and unknown Host", async () => {
  const h = harness();
  for (const path of ["/.git/config", "/%2egit/config", "/%6cogin", "/LOGIN", "/organizations%2fplan", "/node_modules/x", "//login"]) {
    assert.equal((await h.dispatch(main + path)).response.status, 404, path);
  }
  for (const path of ["/proxy_cache_dir/x", "/owner/proxy_cache_dir/x", "/.well-known/file.js"]) {
    assert.equal((await h.dispatch(main + path)).response.status, 403, path);
  }
  assert.equal((await h.dispatch(main + "/.well-known/acme-challenge/token.js")).passthrough, true);
  assert.equal((await h.dispatch(main + "/%bad")).response.status, 400);
  assert.equal((await h.dispatch("https://evil.example/https://github.com/x")).response.status, 404);
  assert.equal(h.calls.length, 0);
});

test("site-owned robots, blocked page, hook and ACME paths all use origin Passthrough", async () => {
  const h = harness();
  for (const host of ["github.gohj99.site", "docs.github.gohj99.site", "raw.github.gohj99.site"]) {
    for (const path of ["/robots.txt", "/static/content-blocked.html", "/static/github-hook.js", "/.well-known/acme-challenge/token"]) {
      assert.equal((await h.dispatch(`https://${host}${path}`)).passthrough, true, `${host}${path}`);
    }
  }
  assert.equal(h.calls.length, 0);
  await h.dispatch(main + "/");
  assert.equal(h.calls.at(-1).url, "https://github.com/");
});

test("credential forwarding, Origin/Referer, and POST body preserve the intended policies", async () => {
  const h = harness(async (url, init) => {
    if (init.body) assert.equal(await new Response(init.body).text(), '{"query":"ok"}');
    return fixture();
  });
  for (const key of ["", "api", "ghcr", "raw"]) {
    await h.dispatch(`https://${proxyHost(key)}/graphql`, { method: "POST", body: '{"query":"ok"}', headers: {
      authorization: "Bearer example", cookie: "session=example", origin: main, referer: main + "/owner/repo", "content-type": "application/json",
    } });
    const headers = h.calls.at(-1).init.headers;
    assert.equal(headers.get("authorization"), ["api", "ghcr"].includes(key) ? "Bearer example" : null);
    assert.equal(headers.get("cookie"), key === "api" ? "session=example" : null);
    assert.equal(headers.get("origin"), "https://github.com");
    assert.equal(headers.get("referer"), "https://github.com/owner/repo");
  }
  assert.equal(h.cacheReads.length, 0);
});

test("large chunked HTML rewrites all domains, UTF-8, SRI and head without body helpers", async () => {
  const originals = pairs.map(([, host]) => `https://${host}/x`).join(" ");
  const sample = '<html><head data-x="yes"><link integrity="sha256-old" href="https://github.githubassets.com/main.css"></head><body>' +
    originals + ' https://gist.githubusercontent.com/u/id/raw/x github.com.evil notgithub.com foo.github.com \u4e2d\u6587 \ud83d\ude00 ';
  const input = sample + "x".repeat(1024 * 1024 + 128) + " https://private-user-images.githubusercontent.com/file</body>";
  const h = harness(() => new Response(chunks(encoder.encode(input), 137), { headers: {
    "content-type": "text/html; charset=utf-8", etag: '"origin"', "content-security-policy": "default-src 'none'",
  } }));
  const { text, response } = await h.dispatch(main + "/owner/repo");
  for (const [key] of pairs) assert.ok(text.includes(`https://${proxyHost(key)}/x`));
  assert.match(text, /<head data-x="yes"><script src="\/static\/github-hook.js"><\/script>/);
  assert.ok(!text.includes("integrity="));
  assert.ok(text.includes("github.com.evil notgithub.com foo.github.com"));
  assert.ok(text.includes("\u4e2d\u6587 \ud83d\ude00"));
  assert.ok(text.endsWith("https://private-user-images.github.gohj99.site/file</body>"));
  assert.equal(response.headers.get("etag"), null);
  assert.equal(response.headers.get("content-length"), null);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'self'/);
});

test("CSS, JS, escaped JSON URLs and every domain split across byte chunks", async () => {
  for (const type of ["text/css", "application/javascript", "text/javascript", "application/json"]) {
    const body = '"https:\\/\\/api.github.com/x" ' + pairs.map(([, host]) => "https://" + host + "/x").join(" ") + " \u4e2d\u6587";
    const h = harness(() => new Response(chunks(encoder.encode(body), 1), { headers: { "content-type": type } }));
    const result = await h.dispatch(main + "/assets/x");
    assert.ok(result.text.includes('"https:\\/\\/api.github.gohj99.site/x"'));
    for (const [key] of pairs) assert.ok(result.text.includes(`https://${proxyHost(key)}/x`));
    assert.ok(result.text.endsWith("\u4e2d\u6587"));
  }
});

test("gzip HTML is decompressed before rewriting and has no stale encoding metadata", async () => {
  const compressed = gzipSync("<html><head></head><body>https://github.com/x</body>");
  const h = harness(() => fixture(compressed, { "content-type": "text/html", "content-encoding": "gzip" }));
  const result = await h.dispatch(main + "/owner/repo");
  assert.ok(result.text.includes("https://github.gohj99.site/x"));
  assert.equal(result.response.headers.get("content-encoding"), null);
});

test("binary, raw text, attachments, OCI and Range responses retain exact bytes", async () => {
  const bytes = encoder.encode("github.com\u0000\ufffd");
  const cases = [
    [main, { "content-type": "application/octet-stream" }, 200, {}],
    [main, { "content-type": "text/plain" }, 200, {}],
    [main, { "content-type": "application/javascript", "content-disposition": "attachment; filename=x.js" }, 200, {}],
    ["https://ghcr.github.gohj99.site", { "content-type": "application/json", "docker-content-digest": "sha256:example" }, 200, {}],
    [main, { "content-type": "text/html", "content-range": "bytes 0-14/100" }, 206, { range: "bytes=0-14" }],
  ];
  for (const [host, headers, status, requestHeaders] of cases) {
    const h = harness(() => fixture(bytes, headers, status));
    const result = await h.dispatch(host + "/file", { headers: requestHeaders });
    assert.deepEqual(result.bytes, bytes);
    assert.equal(result.response.status, status);
    assert.equal(result.response.headers.get("content-length"), String(bytes.length));
    if (status === 206) assert.equal(h.cacheWrites.length, 0);
  }
});

test("HEAD, 204, 205 and 304 never acquire a response body", async () => {
  for (const status of [200, 204, 205, 304]) {
    const h = harness(() => new Response(null, { status, headers: { "content-type": "text/html" } }));
    const result = await h.dispatch(main + "/file", { method: status === 200 ? "HEAD" : "GET" });
    assert.equal(result.response.status, status);
    assert.equal(result.bytes.length, 0);
  }
});

test("response redirects, CORS, Link, Refresh, GHCR realm and service", async () => {
  const h = harness(() => fixture(null, {
    location: "//release-assets.githubusercontent.com/file?jwt=a%2Fb&x=+",
    refresh: '0; url="http://github.com/owner/repo"',
    link: '<https://api.github.com/x?page=2>; rel="next"',
    "access-control-allow-origin": "https://github.com",
    "www-authenticate": 'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:u/r:pull"',
  }, 302));
  const { response } = await h.dispatch(main + "/file");
  assert.equal(response.headers.get("location"), "https://release-assets.github.gohj99.site/file?jwt=a%2Fb&x=+");
  assert.equal(response.headers.get("refresh"), '0; url="https://github.gohj99.site/owner/repo"');
  assert.equal(response.headers.get("access-control-allow-origin"), main);
  assert.ok(response.headers.get("link").includes("api.github.gohj99.site"));
  assert.equal(response.headers.get("www-authenticate"), 'Bearer realm="https://ghcr.github.gohj99.site/token",service="ghcr.io",scope="repository:u/r:pull"');
});

test("cache hit, TTLs, HEAD reuse, Vary and host/query isolation", async () => {
  const h = harness((url, init) => fixture(init.headers.get("accept") || "ok", { vary: "Accept" }));
  const first = await h.dispatch(main + "/data?a=1", { headers: { accept: "v1" } });
  assert.equal(first.response.headers.get("x-cache"), "MISS");
  const second = await h.dispatch(main + "/data?a=1", { headers: { accept: "v1" } });
  assert.equal(second.response.headers.get("x-cache"), "HIT");
  assert.equal(second.response.headers.get("cache-control"), null);
  assert.equal(second.response.headers.get("x-ghproxy-origin-cache-control"), null);
  const head = await h.dispatch(main + "/data?a=1", { method: "HEAD", headers: { accept: "v1" } });
  assert.equal(head.response.headers.get("x-cache"), "HIT");
  assert.equal(head.text, "");
  assert.equal((await h.dispatch(main + "/data?a=1", { headers: { accept: "v2" } })).text, "v2");
  await h.dispatch(main + "/data?a=2");
  await h.dispatch("https://raw.github.gohj99.site/data?a=1");
  assert.equal(h.calls.length, 4);
  assert.equal(h.cacheWrites[0][2], "public, max-age=600");
  assert.equal(h.cacheWrites.at(-1)[0], "gh_static_cache_v1");
  for (const [status, ttl] of [[301, 3600], [404, 60], [403, 30]]) {
    const other = harness(() => fixture("ok", {}, status));
    await other.dispatch(main + "/x");
    assert.equal(other.cacheWrites[0][2], `public, max-age=${ttl}`);
  }
});

test("risky requests bypass reads and writes even with a public cached response", async () => {
  const h = harness();
  await h.dispatch("https://api.github.gohj99.site/data");
  const reads = h.cacheReads.length;
  const writes = h.cacheWrites.length;
  for (const [url, headers] of [
    ["https://api.github.gohj99.site/data", { authorization: "Bearer private" }],
    ["https://api.github.gohj99.site/data", { cookie: "private=yes" }],
    ["https://ghcr.github.gohj99.site/v2/repo/manifests/main", { authorization: "Bearer private" }],
    ["https://gist.github.gohj99.site/user/id", {}],
    ["https://objects.github.gohj99.site/file?X-Amz-Signature=secret", {}],
    ["https://release-assets.github.gohj99.site/file?jwt=secret", {}],
    ["https://codeload.github.gohj99.site/u/r/zip/refs/heads/main", {}],
    [main + "/file", { range: "bytes=0-5" }],
  ]) {
    const { response } = await h.dispatch(url, { headers });
    assert.equal(response.headers.get("x-cache"), "BYPASS");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(h.cacheReads.length, reads);
  assert.equal(h.cacheWrites.length, writes);
});

test("private responses, Set-Cookie, Vary *, errors and unknown lengths are never stored", async () => {
  for (const headers of [{ "cache-control": "private" }, { "cache-control": "no-store" }, { "cache-control": "max-age=0" }, { "set-cookie": "x=y" }, { vary: "*" }]) {
    const h = harness(() => fixture("ok", headers));
    await h.dispatch(main + "/x");
    assert.equal(h.cacheWrites.length, 0);
  }
  const h = harness(() => fixture("error", {}, 500));
  await h.dispatch(main + "/x");
  assert.equal(h.cacheWrites.length, 0);
  const unknown = harness(() => new Response(chunks(encoder.encode("data")), { headers: { "content-type": "text/plain" } }));
  await unknown.dispatch(main + "/x");
  assert.equal(unknown.cacheWrites.length, 0);
});

test("cache failures fall through; upstream errors become 502", async () => {
  const h = harness(() => fixture(), { cacheFailure: true });
  assert.equal((await h.dispatch(main + "/x")).response.status, 200);
  const broken = harness(() => { throw new TypeError("Connection failed"); });
  const result = await broken.dispatch(main + "/x");
  assert.equal(result.response.status, 502);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
});
