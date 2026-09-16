/**
 * Tencent Cloud EdgeOne site Edge Functions, NOT EdgeOne Pages.
 * Paste this entire file into the function editor; no imports or bindings.
 * Source rules: proxy/root.conf and conf/00-ghproxy-global.conf.
 * Runtime: https://cloud.tencent.com/document/product/1552/81344
 * Refresh embedded index files: node github.gohj99.site/build-edge-assets.mjs
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
const STATIC_HOSTS = new Set(Object.keys(HOSTS).filter((host) =>
  ![MAIN_HOST, "api.github.gohj99.site", "docs.github.gohj99.site", "gist.github.gohj99.site", "ghcr.github.gohj99.site"].includes(host)));
const CSP = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; style-src 'unsafe-inline' 'self' https:; script-src 'unsafe-inline' 'unsafe-eval' 'self' https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
const BLOCKED_PATH = /^\/(?:\.git|\.svn|\.bzr|\.vscode|\.claude|\.idea|\.ssh|\.github|\.npm|\.yarn|\.pnpm|\.cache|\.husky|\.turbo|\.next|\.nuxt|node_modules|runtime|vendor|__pycache__|login|signup|session|logout|settings|account|notifications|new|import|authorize|organizations\/plan|marketplace)(?:\/|$)/i;
const TEXT_TYPES = /^(?:text\/(?:html|css|javascript)|application\/(?:javascript|x-javascript|json))(?:\s*;|$)/i;
const DOMAIN_PATTERN = Object.keys(PROXY_HOSTS).sort((a, b) => b.length - a.length)
  .map((host) => host.replace(/\./g, "\\.")).join("|");
const HOST_CHARACTER = /[a-z\d_.-]/i;
const ENCODER = new TextEncoder();
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const CACHE_TTL = { 200: 600, 301: 3600, 404: 60, 403: 30 };

// BEGIN GENERATED LOCAL ASSETS
const LOCAL_ASSETS = {
  "/robots.txt": {
    "type": "text/plain; charset=utf-8",
    "base64": false,
    "body": "User-agent: Amazonbot\r\nUser-agent: SemrushBot\r\nUser-agent: GPTBot\r\nUser-agent: DataForSeoBot\r\nUser-agent: MJ12bot\r\nUser-agent: AhrefsBot\r\nUser-agent: DotBot\r\nUser-agent: SogouBot\r\nUser-agent: Exabot\r\nUser-agent: ia_archiver\r\nUser-agent: meta-externalagent\r\nUser-agent: BacklinksExtendedBot\r\nUser-agent: ClaudeBot\r\nDisallow: /"
  },
  "/static/content-blocked.html": {
    "type": "text/html; charset=utf-8",
    "base64": false,
    "body": "<!doctype html>\n<html lang=\"zh-CN\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>\u6b64\u9875\u9762\u65e0\u6cd5\u8bbf\u95ee</title>\n    <style>\n      :root { color-scheme: light; }\n      * { box-sizing: border-box; }\n      html, body { width: 100%; height: 100%; margin: 0; }\n      body {\n        display: grid;\n        place-items: center;\n        padding: 24px;\n        overflow: hidden;\n        background: #f6f8fa;\n        color: #1f2328;\n        font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n      }\n      .message { width: min(520px, 100%); text-align: center; }\n      .icon {\n        width: 48px;\n        height: 48px;\n        margin: 0 auto 20px;\n        display: grid;\n        place-items: center;\n        border-radius: 50%;\n        background: #cf222e;\n        color: #fff;\n        font-size: 28px;\n        font-weight: 700;\n        line-height: 1;\n      }\n      h1 { margin: 0 0 12px; font-size: 24px; line-height: 1.35; font-weight: 600; }\n      p { margin: 0; color: #59636e; font-size: 15px; line-height: 1.7; }\n    </style>\n  </head>\n  <body>\n    <main class=\"message\" role=\"alert\" aria-live=\"assertive\">\n      <div class=\"icon\" aria-hidden=\"true\">!</div>\n      <h1>\u6b64\u9875\u9762\u65e0\u6cd5\u8bbf\u95ee</h1>\n      <p>\u9875\u9762\u5185\u5bb9\u4e0d\u7b26\u5408\u672c\u7ad9\u5185\u5bb9\u5b89\u5168\u89c4\u5219\u3002</p>\n    </main>\n  </body>\n</html>\n"
  }
};
// END GENERATED LOCAL ASSETS

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

function stripHopHeaders(headers) {
  const connection = headers.get("connection") || "";
  for (const name of connection.split(",")) {
    if (name.trim()) headers.delete(name.trim());
  }
  for (const name of ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]) headers.delete(name);
}

function requestHeaders(request, url, upstreamHost) {
  const headers = new Headers(request.headers);
  stripHopHeaders(headers);
  headers.set("Host", upstreamHost);
  headers.set("Accept-Encoding", "identity");
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Forwarded-Proto", url.protocol.slice(0, -1));
  headers.set("X-Forwarded-Port", url.port || (url.protocol === "https:" ? "443" : "80"));
  const clientIp = request.eo && request.eo.clientIp;
  if (clientIp) {
    headers.set("X-Real-IP", clientIp);
    headers.set("REMOTE-HOST", clientIp);
    headers.set("X-Forwarded-For", [headers.get("x-forwarded-for"), clientIp].filter(Boolean).join(", "));
  } else {
    headers.delete("X-Real-IP");
    headers.delete("REMOTE-HOST");
  }
  if (!["api.github.gohj99.site", "ghcr.github.gohj99.site"].includes(url.hostname)) headers.delete("Authorization");
  if (url.hostname !== "api.github.gohj99.site") headers.delete("Cookie");
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

async function fetchUpstream(event, url, upstreamHost) {
  const request = event.request;
  const headers = requestHeaders(request, url, upstreamHost);
  const bypass = bypassCache(request, url);
  let cache;
  let cacheKey;
  if (!bypass && typeof caches !== "undefined") {
    try {
      cache = await caches.open(STATIC_HOSTS.has(url.hostname) ? "gh_static_cache_v1" : "gh_dynamic_cache_v1");
      cacheKey = new Request(url.href, { method: "GET", headers });
      const hit = await cache.match(cacheKey);
      if (hit && hit.status !== 504) return { response: hit, cacheStatus: "HIT", bypass };
    } catch (_) { /* An expired EdgeOne entry can reject with 504. */ }
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
    eo: { timeoutSetting: { connectTimeout: 60000, readTimeout: 300000, writeTimeout: 300000 } },
  };
  if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;
  const response = await fetch(upstream.href, init);
  const ttl = request.method === "GET" && cache ? cacheTTL(response) : 0;
  if (ttl > 0) {
    const copy = response.clone(true);
    const cacheHeaders = new Headers(copy.headers);
    cacheHeaders.set("Cache-Control", `public, max-age=${ttl}`);
    // Cache a private copy of the original policy, not the internal TTL.
    cacheHeaders.set("X-GHProxy-Origin-Cache-Control", response.headers.get("cache-control") || "");
    const cached = new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers: cacheHeaders });
    event.waitUntil(cache.put(cacheKey, cached).catch(() => {}));
  }
  return { response, cacheStatus: bypass || !cache ? "BYPASS" : "MISS", bypass };
}

function responseHeaders(response, cacheStatus, bypass) {
  const headers = new Headers(response.headers);
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

function rewriteStream(body, type, event) {
  const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(type);
  const decoder = new TextDecoder(charset ? charset[1] : "utf-8");
  const rewrite = textRewriter(/^text\/html(?:\s*;|$)/i.test(type));
  // EdgeOne ignores TransformStream transformers and cannot construct a
  // ReadableStream directly. Pump through its documented reader/writer API.
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
  event.waitUntil(pump);
  return readable;
}

async function proxyRequest(event, url, path) {
  let upstreamHost = HOSTS[url.hostname];
  if (url.hostname === "gist.github.gohj99.site" && /^\/[^/]+\/[^/]+\/raw\//.test(path)) upstreamHost = "gist.githubusercontent.com";
  const { response, cacheStatus, bypass } = await fetchUpstream(event, url, upstreamHost);
  const headers = responseHeaders(response, cacheStatus, bypass);
  const type = headers.get("content-type") || "";
  const transform = TEXT_TYPES.test(type) && response.status !== 206 && !headers.has("content-range") &&
    !event.request.headers.has("range") && !/\battachment\b/i.test(headers.get("content-disposition") || "") &&
    url.hostname !== "ghcr.github.gohj99.site";
  const noBody = event.request.method === "HEAD" || [204, 205, 304].includes(response.status);
  let body = response.body;
  if (transform) {
    for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5", "digest", "content-digest", "repr-digest", "accept-ranges"]) headers.delete(name);
    headers.set("Content-Type", type.replace(/;\s*charset\s*=\s*(?:"[^"]*"|'[^']*'|[^;\s]+)/i, "") + "; charset=utf-8");
    if (!noBody && body) {
      const encoding = (response.headers.get("content-encoding") || "identity").toLowerCase();
      if (encoding !== "identity") body = body.pipeThrough(new DecompressionStream(encoding));
      body = rewriteStream(body, type, event);
    }
  }
  if (noBody) {
    if (body) event.waitUntil(body.cancel().catch(() => {}));
    body = null;
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function handleRequest(event, url, path) {
  const request = event.request;
  if (!own(HOSTS, url.hostname)) return simpleResponse(request, 404, "Unknown proxy host");
  if (BLOCKED_PATH.test(path)) return simpleResponse(request, 404, "Not Found");
  if (/(^|\/)proxy_cache_dir(?:\/|$)/i.test(path) ||
      /^\/\.well-known\/.*\.(?:php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$/.test(path)) return simpleResponse(request, 403, "Forbidden");
  if (/^\/https?:\//i.test(url.pathname)) {
    const match = /^\/https?:\/\/?([^/?#:]+)(\/.*)?$/i.exec(url.pathname);
    if (!match || !own(PROXY_HOSTS, match[1].toLowerCase())) return simpleResponse(request, 404, "Not Found");
    return new Response(null, { status: 301, headers: { Location: "https://" + PROXY_HOSTS[match[1].toLowerCase()] + (match[2] || "/") + url.search } });
  }
  const assetPath = path === "/" && url.hostname === MAIN_HOST ? "/index.html" : path;
  // This script is deliberately served by the configured origin. It can be
  // updated independently and must never be cached or rewritten here.
  if (own(LOCAL_ASSETS, assetPath)) {
    const asset = LOCAL_ASSETS[assetPath];
    if (!["GET", "HEAD"].includes(request.method)) return simpleResponse(request, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    const body = asset.base64 ? Uint8Array.from(atob(asset.body), (char) => char.charCodeAt(0)) : asset.body;
    return new Response(request.method === "HEAD" ? null : body, {
      headers: { "Content-Type": asset.type, "Cache-Control": "public, max-age=300, must-revalidate", "Content-Security-Policy": CSP },
    });
  }
  if (request.headers.get("upgrade")) return simpleResponse(request, 501, "WebSocket upgrades are not supported by this Edge Function");
  return proxyRequest(event, url, path);
}

addEventListener("fetch", (event) => {
  let url;
  let path;
  try {
    url = new URL(event.request.url);
    path = normalizedPath(url);
  } catch (_) {
    event.respondWith(simpleResponse(event.request, 400, "Bad Request"));
    return;
  }
  // ACME remains with the configured origin, matching Nginx's ^~ priority.
  if (own(HOSTS, url.hostname) && path.startsWith("/.well-known/acme-challenge/")) return;
  // Keep the policy hook on the configured origin so it can be updated
  // independently and is never transformed or cached by this function.
  if (own(HOSTS, url.hostname) && path === "/static/github-hook.js") return;
  event.respondWith(handleRequest(event, url, path).catch((error) => {
    console.error("GitHub proxy upstream failure:", error.name || "Error");
    return simpleResponse(event.request, 502, "Bad Gateway");
  }));
});
