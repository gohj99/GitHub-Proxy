/**
 * Deno Deploy GitHub proxy.
 *
 * This is the Deno counterpart of ../EdgeOne/edge-function.js. It uses only
 * Web APIs and Deno.serve(), so the complete Deno directory can be deployed as
 * one application without installing dependencies.
 */

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

const PROXY_HOSTS = Object.fromEntries(
  Object.entries(HOSTS).map(([proxy, origin]) => [origin, proxy]),
);
PROXY_HOSTS["www.github.com"] = MAIN_HOST;
PROXY_HOSTS["gist.githubusercontent.com"] = "gist.github.gohj99.site";

const CSP =
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; style-src 'unsafe-inline' 'self' https:; script-src 'unsafe-inline' 'unsafe-eval' 'self' https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
const BLOCKED_PATH =
  /^\/(?:\.git|\.svn|\.bzr|\.vscode|\.claude|\.idea|\.ssh|\.github|\.npm|\.yarn|\.pnpm|\.cache|\.husky|\.turbo|\.next|\.nuxt|node_modules|runtime|vendor|__pycache__|login|signup|session|logout|settings|account|notifications|new|import|authorize|organizations\/plan|marketplace)(?:\/|$)/i;
const TEXT_TYPES =
  /^(?:text\/(?:html|css|javascript)|application\/(?:javascript|x-javascript|json))(?:\s*;|$)/i;
const DOMAIN_PATTERN = Object.keys(PROXY_HOSTS)
  .sort((a, b) => b.length - a.length)
  .map((host) => host.replace(/\./g, "\\."))
  .join("|");
const HOST_CHARACTER = /[a-z\d_.-]/i;
const ENCODER = new TextEncoder();
const CACHE_TTL = { 200: 600, 301: 3600, 404: 60, 403: 30 };

const LOCAL_ASSETS = {
  "/robots.txt": {
    url: new URL("./static/robots.txt", import.meta.url),
    type: "text/plain; charset=utf-8",
  },
  "/static/content-blocked.html": {
    url: new URL("./static/content-blocked.html", import.meta.url),
    type: "text/html; charset=utf-8",
  },
  "/static/github-hook.js": {
    url: new URL("./static/github-hook.js", import.meta.url),
    type: "text/javascript; charset=utf-8",
  },
};
const assetBodies = new Map();

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function simpleResponse(request, status, message, extra = {}) {
  return new Response(request.method === "HEAD" ? null : message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

async function localAsset(request, path) {
  const asset = LOCAL_ASSETS[path];
  if (!asset) return null;
  let body = assetBodies.get(path);
  if (body === undefined) {
    body = await Deno.readTextFile(asset.url);
    assetBodies.set(path, body);
  }
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": asset.type,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizedPath(url) {
  const decoded = decodeURIComponent(url.pathname);
  if (/[\x00-\x1f\x7f]/.test(decoded)) throw new Error("Invalid path");
  return new URL(
    "https://path.invalid/" + decoded.replace(/^\/+/, ""),
  ).pathname.replace(/\/{2,}/g, "/");
}

function rewriteDomains(text) {
  return text.replace(
    new RegExp(DOMAIN_PATTERN, "gi"),
    (host, offset, source) => {
      if (
        HOST_CHARACTER.test(source[offset - 1] || "") ||
        HOST_CHARACTER.test(source[offset + host.length] || "")
      ) return host;
      return PROXY_HOSTS[host.toLowerCase()];
    },
  );
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
  for (
    const name of [
      "connection",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailer",
      "transfer-encoding",
      "upgrade",
    ]
  ) headers.delete(name);
}

function requestHeaders(request, url) {
  const headers = new Headers(request.headers);
  stripHopHeaders(headers);
  // The upstream URL controls Host. Setting Host manually is not portable in
  // Fetch implementations and is unnecessary in Deno.
  headers.delete("host");
  headers.set("Accept-Encoding", "identity");
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Forwarded-Proto", url.protocol.slice(0, -1));
  headers.set(
    "X-Forwarded-Port",
    url.port || (url.protocol === "https:" ? "443" : "80"),
  );
  const forwarded = headers.get("x-forwarded-for") || headers.get("x-real-ip");
  if (forwarded) {
    const clientIp = forwarded.split(",")[0].trim();
    headers.set("X-Real-IP", clientIp);
    headers.set("REMOTE-HOST", clientIp);
  } else {
    headers.delete("X-Real-IP");
    headers.delete("REMOTE-HOST");
  }
  if (!["api.github.gohj99.site", "ghcr.github.gohj99.site"].includes(url.hostname)) {
    headers.delete("Authorization");
  }
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
    } catch (_) {
      // Leave non-URL header values unchanged.
    }
  }
  return headers;
}

function bypassCache(request, url) {
  if (!["GET", "HEAD"].includes(request.method) || request.headers.has("range")) return true;
  if (/no-cache|no-store|max-age\s*=\s*0/i.test(request.headers.get("cache-control") || "")) {
    return true;
  }
  if (/no-cache/i.test(request.headers.get("pragma") || "")) return true;
  if (url.hostname === "gist.github.gohj99.site") return true;
  if (
    url.hostname === "api.github.gohj99.site" &&
    (request.headers.has("authorization") || request.headers.has("cookie"))
  ) return true;
  if (
    url.hostname === "ghcr.github.gohj99.site" &&
    (request.headers.has("authorization") || url.pathname === "/token")
  ) return true;
  if (
    url.hostname === "codeload.github.gohj99.site" &&
    /^\/[^/]+\/[^/]+\/(?:zip|tar\.gz|legacy\.zip|legacy\.tar\.gz)\/refs\//.test(url.pathname)
  ) return true;
  let signed = false;
  url.searchParams.forEach((_value, key) => {
    if (
      /^(?:x-amz-(?:algorithm|credential|date|expires|signature|signedheaders)|x-goog-signature|jwt|sig|access_token)$/i
        .test(key)
    ) signed = true;
  });
  return signed;
}

function cacheTTL(response) {
  if (
    !own(CACHE_TTL, response.status) || response.headers.has("set-cookie") ||
    /(?:^|,)\s*\*\s*(?:,|$)/.test(response.headers.get("vary") || "")
  ) return 0;
  const cc = response.headers.get("cache-control") || "";
  if (
    /(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|=|,|$)/i.test(cc) ||
    (!cc && /no-cache/i.test(response.headers.get("pragma") || ""))
  ) return 0;
  const maxAge = cc.match(/(?:^|,)\s*s-maxage\s*=\s*"?(\d+)/i) ||
    cc.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i);
  if (maxAge) {
    return Math.max(
      0,
      Number(maxAge[1]) - Number(response.headers.get("age") || 0),
    );
  }
  if (response.headers.has("expires")) {
    const expires = Date.parse(response.headers.get("expires"));
    return Number.isFinite(expires) ? Math.max(0, Math.floor((expires - Date.now()) / 1000)) : 0;
  }
  return CACHE_TTL[response.status];
}

function appendVary(headers, ...names) {
  const values = (headers.get("vary") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const known = new Set(values.map((value) => value.toLowerCase()));
  for (const name of names) {
    if (!known.has(name.toLowerCase())) values.push(name);
  }
  if (values.length) headers.set("Vary", values.join(", "));
}

async function fetchUpstream(request, url, upstreamHost) {
  const headers = requestHeaders(request, url);
  const bypass = bypassCache(request, url);
  const upstream = new URL(url.href);
  upstream.protocol = "https:";
  upstream.host = upstreamHost;
  upstream.port = "";
  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;
  const response = await fetch(upstream, init);
  return { response, bypass };
}

function responseHeaders(response, url, bypass) {
  const headers = new Headers(response.headers);
  stripHopHeaders(headers);
  for (
    const name of [
      "content-security-policy",
      "content-security-policy-report-only",
      "server",
      "x-github-request-id",
    ]
  ) headers.delete(name);
  if (headers.has("location")) {
    headers.set("Location", rewriteURL(headers.get("location")));
  }
  if (headers.has("refresh")) {
    headers.set(
      "Refresh",
      headers.get("refresh").replace(
        /(url\s*=\s*)(["']?)(.*?)(\2)$/i,
        (_all, prefix, quote, target) => prefix + quote + rewriteURL(target) + quote,
      ),
    );
  }
  for (const name of ["link", "access-control-allow-origin", "content-location"]) {
    if (headers.has(name)) headers.set(name, rewriteDomains(headers.get(name)));
  }
  if (headers.has("www-authenticate")) {
    headers.set(
      "WWW-Authenticate",
      headers.get("www-authenticate").replace(
        /(realm=")([^"]+)(")/gi,
        (_all, before, target, after) => before + rewriteURL(target) + after,
      ),
    );
  }
  headers.set("Content-Security-Policy", CSP);
  // Deno's CDN runs before the app. Vary prevents an anonymous response from
  // satisfying a later credentialed request to the API or GHCR.
  if (url.hostname === "api.github.gohj99.site") {
    appendVary(headers, "Authorization", "Cookie");
  } else if (url.hostname === "ghcr.github.gohj99.site") {
    appendVary(headers, "Authorization");
  }
  if (bypass) {
    headers.set("Cache-Control", "private, no-store");
    headers.set("Deno-CDN-Cache-Control", "private, no-store");
  } else {
    const ttl = cacheTTL(response);
    if (ttl > 0) {
      // Deno Deploy's CDN caches the final, rewritten response before the app
      // is invoked again. Cache-Status, added by the platform, reports hits.
      headers.set("Deno-CDN-Cache-Control", `public, s-maxage=${ttl}`);
    }
  }
  return headers;
}

function textRewriter(isHTML) {
  const pattern = new RegExp(
    (isHTML ? "<(?:head|script|link)\\b[^<>]{0,8192}>|" : "") +
      DOMAIN_PATTERN,
    "gi",
  );
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
      if (tokenEnd > end) {
        end = match.index;
        break;
      }
      let replacement = token;
      if (token[0] === "<") {
        replacement = rewriteDomains(token);
        replacement = replacement.replace(
          /\s+integrity\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
          "",
        );
        if (!injected && /^<head(?:\s|>)/i.test(token)) {
          replacement += '<script src="/static/github-hook.js"></script>';
          injected = true;
        }
      } else if (
        !HOST_CHARACTER.test(match.index ? pending[match.index - 1] : previous) &&
        !HOST_CHARACTER.test(pending[tokenEnd] || "")
      ) {
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
  return body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        const output = rewrite(decoder.decode(chunk, { stream: true }));
        if (output) controller.enqueue(ENCODER.encode(output));
      },
      flush(controller) {
        const output = rewrite(decoder.decode(), true);
        if (output) controller.enqueue(ENCODER.encode(output));
      },
    }),
  );
}

async function proxyRequest(request, url, path) {
  let upstreamHost = HOSTS[url.hostname];
  if (
    url.hostname === "gist.github.gohj99.site" &&
    /^\/[^/]+\/[^/]+\/raw\//.test(path)
  ) upstreamHost = "gist.githubusercontent.com";
  const { response, bypass } = await fetchUpstream(
    request,
    url,
    upstreamHost,
  );
  const headers = responseHeaders(response, url, bypass);
  const type = headers.get("content-type") || "";
  const transform = TEXT_TYPES.test(type) && response.status !== 206 &&
    !headers.has("content-range") && !request.headers.has("range") &&
    !/\battachment\b/i.test(headers.get("content-disposition") || "") &&
    url.hostname !== "ghcr.github.gohj99.site";
  const noBody = request.method === "HEAD" ||
    [204, 205, 304].includes(response.status);
  let body = response.body;
  if (transform) {
    for (
      const name of [
        "content-length",
        "content-encoding",
        "etag",
        "last-modified",
        "content-md5",
        "digest",
        "content-digest",
        "repr-digest",
        "accept-ranges",
      ]
    ) headers.delete(name);
    headers.set(
      "Content-Type",
      type.replace(
        /;\s*charset\s*=\s*(?:"[^"]*"|'[^']*'|[^;\s]+)/i,
        "",
      ) + "; charset=utf-8",
    );
    if (!noBody && body) body = rewriteStream(body, type);
  }
  if (noBody) {
    if (body) body.cancel().catch(() => {});
    body = null;
  }
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleRequest(request, url, path) {
  if (!own(HOSTS, url.hostname)) {
    return simpleResponse(request, 404, "Unknown proxy host");
  }
  const asset = await localAsset(request, path);
  if (asset) return asset;
  if (path.startsWith("/.well-known/acme-challenge/")) {
    return simpleResponse(request, 404, "Not Found");
  }
  if (BLOCKED_PATH.test(path)) return simpleResponse(request, 404, "Not Found");
  if (
    /(^|\/)proxy_cache_dir(?:\/|$)/i.test(path) ||
    /^\/\.well-known\/.*\.(?:php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$/.test(path)
  ) return simpleResponse(request, 403, "Forbidden");
  if (/^\/https?:\//i.test(url.pathname)) {
    const match = /^\/https?:\/\/?([^/?#:]+)(\/.*)?$/i.exec(url.pathname);
    if (!match || !own(PROXY_HOSTS, match[1].toLowerCase())) {
      return simpleResponse(request, 404, "Not Found");
    }
    return new Response(null, {
      status: 301,
      headers: {
        Location: "https://" + PROXY_HOSTS[match[1].toLowerCase()] +
          (match[2] || "/") + url.search,
      },
    });
  }
  if (request.headers.get("upgrade")) {
    return simpleResponse(
      request,
      501,
      "WebSocket upgrades are not supported by this Deno Deploy application",
    );
  }
  return proxyRequest(request, url, path);
}

export async function handler(request) {
  let url;
  let path;
  try {
    url = new URL(request.url);
    path = normalizedPath(url);
  } catch (_) {
    return simpleResponse(request, 400, "Bad Request");
  }
  try {
    return await handleRequest(request, url, path);
  } catch (error) {
    console.error(
      "GitHub proxy upstream failure:",
      error && error.name || "Error",
    );
    return simpleResponse(request, 502, "Bad Gateway");
  }
}

if (import.meta.main) Deno.serve(handler);
