/**
 * Alibaba Cloud ESA Functions GitHub proxy.
 * Paste this entire file into an ESA Function entry file; it has no imports
 * or bindings. The routing rules mirror proxy/root.conf and the EdgeOne
 * implementation in ../EdgeOne/edge-function.js.
 * Runtime API: https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/runtimeapi-manual
 */
"use strict";

const MAIN_HOST = "github.gohj99.site";
const HOSTS = {
  "github.gohj99.site": "github.com",
  "api.github.gohj99.site": "api.github.com",
  "raw.github.gohj99.site": "raw.githubusercontent.com",
  "camo.github.gohj99.site": "camo.githubusercontent.com",
  "docs.github.gohj99.site": "docs.github.com",
  "gist.github.gohj99.site": "gist.github.com",
  "assets.github.gohj99.site": "github.githubassets.com",
  "avatars.github.gohj99.site": "avatars.githubusercontent.com",
  "objects.github.gohj99.site": "objects.githubusercontent.com",
  "codeload.github.gohj99.site": "codeload.github.com",
  "ghcr.github.gohj99.site": "ghcr.io",
  "gist-assets.github.gohj99.site": "gist-assets.githubusercontent.com",
  "user-images.github.gohj99.site": "user-images.githubusercontent.com",
  "private-user-images.github.gohj99.site": "private-user-images.githubusercontent.com",
  "release-assets.github.gohj99.site": "release-assets.githubusercontent.com",
  "github-releases.github.gohj99.site": "github-releases.githubusercontent.com",
};
const PROXY_HOSTS = Object.fromEntries(Object.entries(HOSTS).map(([proxy, origin]) => [origin, proxy]));
PROXY_HOSTS["www.github.com"] = MAIN_HOST;
PROXY_HOSTS["gist.githubusercontent.com"] = "gist.github.gohj99.site";
const CSP = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; style-src 'unsafe-inline' 'self' https:; script-src 'unsafe-inline' 'unsafe-eval' 'self' https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
const BLOCKED_PATH = /^\/(?:\.git|\.svn|\.bzr|\.vscode|\.claude|\.idea|\.ssh|\.github|\.npm|\.yarn|\.pnpm|\.cache|\.husky|\.turbo|\.next|\.nuxt|node_modules|runtime|vendor|__pycache__|login|signup|session|logout|settings|account|notifications|new|import|authorize|organizations\/plan|marketplace)(?:\/|$)/i;
const TEXT_TYPES = /^(?:text\/(?:html|css|javascript)|application\/(?:javascript|x-javascript|json))(?:\s*;|$)/i;
const DOMAIN_PATTERN = Object.keys(PROXY_HOSTS).sort((a, b) => b.length - a.length)
  .map((host) => host.replace(/\./g, "\\.")).join("|");
const HOST_CHARACTER = /[a-z\d_.-]/i;
const ENCODER = new TextEncoder();
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const CACHE_TTL = { 200: 600, 301: 3600, 404: 60, 403: 30 };
// ESA rejects reads and writes for these request-header names. Host is set by
// fetch from the upstream URL and must never be copied from the client.
const ESA_FORBIDDEN_HEADERS = new Set([
  "expect", "te", "trailer", "upgrade", "proxy-connection", "connection",
  "keep-alive", "dnt", "host",
]);
const ESA_FALLBACK_HEADERS = [
  "accept", "accept-language", "age", "authorization", "cache-control", "content-disposition",
  "content-encoding", "content-language", "content-length", "content-location", "content-range",
  "content-security-policy", "content-security-policy-report-only", "content-type", "cookie",
  "digest", "etag", "expires", "if-match", "if-modified-since", "if-none-match", "if-range",
  "if-unmodified-since", "last-modified", "link", "location", "origin", "pragma", "range",
  "referer", "refresh", "server", "set-cookie", "user-agent", "vary", "www-authenticate",
  "x-forwarded-for", "x-real-ip",
];

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function simpleResponse(request, status, message, extra = {}) {
  return new Response(request.method === "HEAD" ? null : message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

function normalizedPath(url) {
  // Nginx evaluates locations against a decoded, slash/dot-normalized URI.
  const decoded = decodeURIComponent(url.pathname);
  if (/[\x00-\x1f\x7f]/.test(decoded)) throw new Error("Invalid path");
  return new URL("https://path.invalid/" + decoded.replace(/^\/+/, "")).pathname.replace(/\/{2,}/g, "/");
}

function rewriteDomains(text) {
  return text.replace(new RegExp(DOMAIN_PATTERN, "gi"), (host, offset, source) => {
    if (HOST_CHARACTER.test(source[offset - 1] || "") ||
        HOST_CHARACTER.test(source[offset + host.length] || "")) return host;
    return PROXY_HOSTS[host.toLowerCase()];
  });
}

function rewriteURL(value) {
  if (!/^(?:https?:)?\/\//i.test(value)) return value;
  try {
    const url = new URL(value, "https://github.com");
    if (!own(PROXY_HOSTS, url.hostname)) return value;
    url.protocol = "https:";
    url.host = PROXY_HOSTS[url.hostname];
    url.port = "";
    return url.href;
  } catch (_) {
    return value;
  }
}

function safeDelete(headers, name) {
  try { headers.delete(name); } catch (_) { /* ESA protects hop-by-hop headers. */ }
}

function copyHeaders(source) {
  const headers = new Headers();
  try {
    source.forEach((value, name) => {
      if (!ESA_FORBIDDEN_HEADERS.has(name.toLowerCase())) headers.set(name, value);
    });
  } catch (_) {
    // Some ESA runtime revisions throw while iterating a collection that
    // contains a forbidden field. Recover useful fields one by one.
    for (const name of ESA_FALLBACK_HEADERS) {
      try {
        const value = source.get(name);
        if (value !== null) headers.set(name, value);
      } catch (_) { /* Ignore a runtime-protected header. */ }
    }
  }
  return headers;
}

function stripHopHeaders(headers) {
  // Do not read Connection on ESA: it is one of the platform's forbidden
  // headers. The remaining hop-by-hop fields are removed defensively.
  for (const name of ["proxy-authenticate", "proxy-authorization", "transfer-encoding"]) safeDelete(headers, name);
}

function requestHeaders(request, url) {
  const headers = copyHeaders(request.headers);
  stripHopHeaders(headers);
  headers.set("Accept-Encoding", "identity");
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Forwarded-Proto", url.protocol.slice(0, -1));
  headers.set("X-Forwarded-Port", url.port || (url.protocol === "https:" ? "443" : "80"));
  const clientIp = headers.get("x-forwarded-for") || headers.get("x-real-ip");
  if (clientIp) {
    const firstIp = clientIp.split(",")[0].trim();
    headers.set("X-Real-IP", firstIp);
    headers.set("REMOTE-HOST", firstIp);
    headers.set("X-Forwarded-For", clientIp);
  } else {
    safeDelete(headers, "X-Real-IP");
    safeDelete(headers, "REMOTE-HOST");
  }
  if (!["api.github.gohj99.site", "ghcr.github.gohj99.site"].includes(url.hostname)) safeDelete(headers, "Authorization");
  if (url.hostname !== "api.github.gohj99.site") safeDelete(headers, "Cookie");
  for (const name of ["origin", "referer"]) {
    const value = headers.get(name);
    if (!value || value === "null") continue;
    try {
      const referer = new URL(value);
      if (own(HOSTS, referer.hostname)) {
        referer.host = HOSTS[referer.hostname];
        referer.port = "";
        referer.protocol = "https:";
        headers.set(name, name === "origin" ? referer.origin : referer.href);
      }
    } catch (_) { /* Leave non-URL header values unchanged. */ }
  }
  return headers;
}

function bypassCache(request, url) {
  if (!["GET", "HEAD"].includes(request.method) || request.headers.has("range")) return true;
  if (/no-cache|no-store|max-age\s*=\s*0/i.test(request.headers.get("cache-control") || "")) return true;
  if (/no-cache/i.test(request.headers.get("pragma") || "")) return true;
  if (url.hostname === "gist.github.gohj99.site") return true;
  if (url.hostname === "api.github.gohj99.site" &&
      (request.headers.has("authorization") || request.headers.has("cookie"))) return true;
  if (url.hostname === "ghcr.github.gohj99.site" &&
      (request.headers.has("authorization") || url.pathname === "/token")) return true;
  if (url.hostname === "codeload.github.gohj99.site" &&
      /^\/[^/]+\/[^/]+\/(?:zip|tar\.gz|legacy\.zip|legacy\.tar\.gz)\/refs\//.test(url.pathname)) return true;
  let signed = false;
  url.searchParams.forEach((value, key) => {
    if (/^(?:x-amz-(?:algorithm|credential|date|expires|signature|signedheaders)|x-goog-signature|jwt|sig|access_token)$/i.test(key)) signed = true;
  });
  return signed;
}

function cacheTTL(response) {
  if (!own(CACHE_TTL, response.status) || response.headers.has("set-cookie") ||
      /(?:^|,)\s*\*\s*(?:,|$)/.test(response.headers.get("vary") || "")) return 0;
  const length = Number(response.headers.get("content-length"));
  if (!response.headers.has("content-length") || !Number.isFinite(length) || length > MAX_CACHE_BYTES) return 0;
  const cc = response.headers.get("cache-control") || "";
  if (/(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|=|,|$)/i.test(cc) ||
      (!cc && /no-cache/i.test(response.headers.get("pragma") || ""))) return 0;
  const maxAge = cc.match(/(?:^|,)\s*s-maxage\s*=\s*"?(\d+)/i) || cc.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i);
  if (maxAge) return Math.max(0, Number(maxAge[1]) - Number(response.headers.get("age") || 0));
  if (response.headers.has("expires")) {
    const expires = Date.parse(response.headers.get("expires"));
    return Number.isFinite(expires) ? Math.max(0, Math.floor((expires - Date.now()) / 1000)) : 0;
  }
  return CACHE_TTL[response.status];
}

function cacheKey(url, request) {
  // ESA Cache API requires an HTTP URL. Add Accept to the key for responses
  // whose origin uses Vary: Accept, while preserving host/path/query isolation.
  const key = new URL("http://" + url.host + url.pathname + url.search);
  const accept = request.headers.get("accept");
  if (accept) key.searchParams.append("__ghproxy_accept", accept);
  return key.href;
}

function getCacheStore() {
  // ESA documents the binding as the global `cache`; globalThis.cache keeps
  // this source testable in Node and compatible with runtimes that expose it
  // as a global property instead of a lexical binding.
  try {
    if (typeof cache !== "undefined") return cache;
  } catch (_) { /* Fall back to globalThis below. */ }
  return typeof globalThis !== "undefined" ? globalThis.cache : null;
}

async function fetchUpstream(request, url, upstreamHost) {
  const headers = requestHeaders(request, url);
  const bypass = bypassCache(request, url);
  const cacheStore = getCacheStore();
  const canCache = cacheStore && typeof cacheStore.get === "function" && typeof cacheStore.put === "function";
  const key = cacheKey(url, request);
  if (!bypass && canCache) {
    try {
      const hit = await cacheStore.get(key);
      if (hit && hit.status !== 504) return { response: hit, cacheStatus: "HIT", bypass };
    } catch (_) { /* ESA cache failures fall through to the origin. */ }
  }
  const upstream = new URL(url.href);
  // Assign the host, rather than resolving a path that could start with //.
  upstream.protocol = "https:";
  upstream.host = upstreamHost;
  upstream.port = "";
  const init = {
    method: request.method,
    headers,
    redirect: "manual",
    // ESA normally decompresses Fetch responses. Keep the compressed stream
    // so the same explicit rewrite/decompression path works for all origins.
    decompress: "manual",
  };
  if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;
  const response = await fetch(upstream.href, init);
  const ttl = request.method === "GET" && canCache ? cacheTTL(response) : 0;
  if (ttl > 0) {
    const copy = response.clone();
    const cacheHeaders = copyHeaders(copy.headers);
    cacheHeaders.set("Cache-Control", `public, max-age=${ttl}`);
    // Cache a private copy of the original policy, not the internal TTL.
    cacheHeaders.set("X-GHProxy-Origin-Cache-Control", response.headers.get("cache-control") || "");
    const cached = new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers: cacheHeaders });
    await cacheStore.put(key, cached).catch(() => {});
  }
  return { response, cacheStatus: bypass || !canCache ? "BYPASS" : "MISS", bypass };
}

function responseHeaders(response, cacheStatus, bypass) {
  const headers = copyHeaders(response.headers);
  stripHopHeaders(headers);
  if (cacheStatus === "HIT" && headers.has("x-ghproxy-origin-cache-control")) {
    const original = headers.get("x-ghproxy-origin-cache-control");
    if (original) headers.set("Cache-Control", original);
    else headers.delete("Cache-Control");
  }
  for (const name of ["x-ghproxy-origin-cache-control", "content-security-policy", "content-security-policy-report-only", "server", "x-github-request-id"]) headers.delete(name);
  if (headers.has("location")) headers.set("Location", rewriteURL(headers.get("location")));
  if (headers.has("refresh")) headers.set("Refresh", headers.get("refresh").replace(/(url\s*=\s*)(["']?)(.*?)(\2)$/i,
    (all, prefix, quote, url) => prefix + quote + rewriteURL(url) + quote));
  for (const name of ["link", "access-control-allow-origin", "content-location"]) {
    if (headers.has(name)) headers.set(name, rewriteDomains(headers.get(name)));
  }
  // GHCR's realm URL changes; its service/scope identifiers must stay intact.
  if (headers.has("www-authenticate")) headers.set("WWW-Authenticate", headers.get("www-authenticate").replace(
    /(realm=")([^"]+)(")/gi, (all, before, url, after) => before + rewriteURL(url) + after));
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Cache", cacheStatus);
  if (bypass) headers.set("Cache-Control", "private, no-store");
  return headers;
}

function textRewriter(isHTML) {
  const pattern = new RegExp((isHTML ? "<(?:head|script|link)\\b[^<>]{0,8192}>|" : "") + DOMAIN_PATTERN, "gi");
  const reserve = isHTML ? 8256 : 128;
  let pending = "";
  let previous = "";
  let injected = false;
  return (text, final = false) => {
    pending += text;
    let end = final ? pending.length : Math.max(0, pending.length - reserve);
    if (!final && /[\uD800-\uDBFF]/.test(pending[end - 1] || "")) end--;
    let cursor = 0;
    let output = "";
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(pending)) && match.index < end) {
      const token = match[0];
      const tokenEnd = match.index + token.length;
      if (tokenEnd > end) { end = match.index; break; }
      let replacement = token;
      if (token[0] === "<") {
        replacement = rewriteDomains(token);
        // Rewritten JS/CSS no longer matches the origin's Subresource Integrity.
        replacement = replacement.replace(/\s+integrity\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
        if (!injected && /^<head(?:\s|>)/i.test(token)) {
          replacement += '<script src="/static/github-hook.js"></script>';
          injected = true;
        }
      } else if (!HOST_CHARACTER.test(match.index ? pending[match.index - 1] : previous) &&
                 !HOST_CHARACTER.test(pending[tokenEnd] || "")) {
        replacement = PROXY_HOSTS[token.toLowerCase()];
      }
      output += pending.slice(cursor, match.index) + replacement;
      cursor = tokenEnd;
    }
    output += pending.slice(cursor, end);
    if (end) previous = pending[end - 1];
    pending = pending.slice(end);
    return output;
  };
}

function rewriteStream(body, type) {
  const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(type);
  const decoder = new TextDecoder(charset ? charset[1] : "utf-8");
  const rewrite = textRewriter(/^text\/html(?:\s*;|$)/i.test(type));
  // Pump through the standard Streams API supported by ESA's runtime.
  const { readable, writable } = new TransformStream();
  const reader = body.getReader();
  const writer = writable.getWriter();
  const pump = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        const output = rewrite(done ? decoder.decode() : decoder.decode(value, { stream: true }), done);
        if (output) await writer.write(ENCODER.encode(output));
        if (done) break;
      }
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => {});
      await reader.cancel(error).catch(() => {});
    } finally {
      reader.releaseLock();
      writer.releaseLock();
    }
  })();
  return readable;
}

async function proxyRequest(request, url, path) {
  let upstreamHost = HOSTS[url.hostname];
  if (url.hostname === "gist.github.gohj99.site" && /^\/[^/]+\/[^/]+\/raw\//.test(path)) upstreamHost = "gist.githubusercontent.com";
  const { response, cacheStatus, bypass } = await fetchUpstream(request, url, upstreamHost);
  const headers = responseHeaders(response, cacheStatus, bypass);
  const type = headers.get("content-type") || "";
  const transform = TEXT_TYPES.test(type) && response.status !== 206 && !headers.has("content-range") &&
    !request.headers.has("range") && !/\battachment\b/i.test(headers.get("content-disposition") || "") &&
    url.hostname !== "ghcr.github.gohj99.site";
  const noBody = request.method === "HEAD" || [204, 205, 304].includes(response.status);
  let body = response.body;
  if (transform) {
    for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5", "digest", "content-digest", "repr-digest", "accept-ranges"]) headers.delete(name);
    headers.set("Content-Type", type.replace(/;\s*charset\s*=\s*(?:"[^"]*"|'[^']*'|[^;\s]+)/i, "") + "; charset=utf-8");
    if (!noBody && body) {
      const encoding = (response.headers.get("content-encoding") || "identity").toLowerCase();
      if (encoding !== "identity") body = body.pipeThrough(new DecompressionStream(encoding));
      body = rewriteStream(body, type);
    }
  }
  if (noBody) {
    if (body) body.cancel().catch(() => {});
    body = null;
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function handleRequest(request, url, path) {
  if (!own(HOSTS, url.hostname)) return simpleResponse(request, 404, "Unknown proxy host");
  if (BLOCKED_PATH.test(path)) return simpleResponse(request, 404, "Not Found");
  if (/(^|\/)proxy_cache_dir(?:\/|$)/i.test(path) ||
      /^\/\.well-known\/.*\.(?:php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$/.test(path)) return simpleResponse(request, 403, "Forbidden");
  if (/^\/https?:\//i.test(url.pathname)) {
    const match = /^\/https?:\/\/?([^/?#:]+)(\/.*)?$/i.exec(url.pathname);
    if (!match || !own(PROXY_HOSTS, match[1].toLowerCase())) return simpleResponse(request, 404, "Not Found");
    return new Response(null, { status: 301, headers: { Location: "https://" + PROXY_HOSTS[match[1].toLowerCase()] + (match[2] || "/") + url.search } });
  }
  // ESA forbids reading the Upgrade header. WebSocket upgrades are therefore
  // left to a dedicated ESA route; ordinary HTTP requests are proxied here.
  return proxyRequest(request, url, path);
}

export default {
  async fetch(request) {
    let url;
    let path;
    try {
      url = new URL(request.url);
      path = normalizedPath(url);
    } catch (_) {
      return simpleResponse(request, 400, "Bad Request");
    }
    // ESA Pages serves matching assets before invoking the function. Keep
    // robots, the content-blocked page, the hook, and ACME files in the Pages
    // assets directory (or a higher-priority origin route) so they bypass this
    // proxy, just as they do in the EdgeOne deployment.
    try {
      return await handleRequest(request, url, path);
    } catch (error) {
      console.log("GitHub proxy upstream failure:", error && error.name || "Error");
      return simpleResponse(request, 502, "Bad Gateway");
    }
  },
};
