import assert from "node:assert/strict";
import { test } from "node:test";
import handler from "./edge-function.js";

test("ESA module entry proxies an anonymous HTML request", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("<html><head></head><body>https://github.com/x</body></html>", {
      headers: { "content-type": "text/html" },
    });
  };
  globalThis.cache = {
    async get() { return undefined; },
    async put() {},
  };

  const response = await handler.fetch(new Request("https://github.gohj99.site/owner/repo", {
    headers: { authorization: "Bearer private", "x-forwarded-for": "203.0.113.7" },
  }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /github\.gohj99\.site\/x/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://github.com/owner/repo");
  assert.equal(calls[0].init.headers.get("host"), null);
  assert.equal(calls[0].init.headers.get("authorization"), null);
  assert.equal(calls[0].init.headers.get("x-real-ip"), "203.0.113.7");
});

test("ESA module preserves API credentials and handles denied paths", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { headers: { "content-type": "application/json" } });
  };
  const api = await handler.fetch(new Request("https://api.github.gohj99.site/graphql", {
    method: "POST",
    body: "{}",
    headers: { authorization: "Bearer api", cookie: "session=1" },
  }));
  assert.equal(api.status, 200);
  assert.equal(calls[0].url, "https://api.github.com/graphql");
  assert.equal(calls[0].init.headers.get("authorization"), "Bearer api");
  assert.equal(calls[0].init.headers.get("cookie"), "session=1");
  assert.equal((await handler.fetch(new Request("https://github.gohj99.site/.git/config"))).status, 404);
});
