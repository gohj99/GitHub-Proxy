# Netlify Edge 部署

本目录包含一个适用于 Netlify Edge Functions 的 GitHub 代理函数：
`netlify/edge-functions/github-proxy.js`。

在 Netlify 中把 `github.gohj99.site` 设置为站点的 **Base directory**，然后使用目录内的
`netlify.toml`。它会把 `index` 作为静态发布目录，并自动发现 Edge Function。

函数使用 Netlify 的标准入口 `export default (request, context)`，所有访问路径通过
`config.path = "/*"` 匹配。robots、拦截页、拦截脚本和 ACME 验证路径返回 `undefined`，因此
继续由 Netlify 静态站点处理；其他已配置的 GitHub 子域名会按请求 Host 选择 HTTPS 上游。

Netlify Edge 与 EdgeOne 的运行时不同，函数已经做了这些适配：

- 使用 `context.ip` 和 `context.waitUntil()`，不依赖 EdgeOne 的 `request.eo`。
- 使用 `Netlify-CDN-Cache-Control` 申请安全响应的边缘缓存；响应还会按 Authorization（API
  另外按 Cookie）分离缓存键，带凭据、签名查询、Range、Gist 和可变归档请求返回
  `private, no-store`。
- 使用标准的 ES module handler，不使用 `addEventListener("fetch", ...)`、EdgeOne Cache API
  或 EdgeOne 专用超时配置。

部署前可在该目录运行：

```powershell
node --check netlify/edge-functions/github-proxy.js
```

然后用 Netlify CLI 在 `github.gohj99.site` 目录启动本地环境：

```powershell
netlify dev
```

请为以下域名配置 Netlify 自定义域名、DNS 和 HTTPS，并让它们指向同一个站点：
`github.gohj99.site`、`api.github.gohj99.site`、`raw.github.gohj99.site`、`camo.github.gohj99.site`、
`docs.github.gohj99.site`、`gist.github.gohj99.site`、`assets.github.gohj99.site`、
`avatars.github.gohj99.site`、`objects.github.gohj99.site`、`codeload.github.gohj99.site`、
`ghcr.github.gohj99.site`、`gist-assets.github.gohj99.site`、`user-images.github.gohj99.site`、
`private-user-images.github.gohj99.site`、`release-assets.github.gohj99.site` 和
`github-releases.github.gohj99.site`。
