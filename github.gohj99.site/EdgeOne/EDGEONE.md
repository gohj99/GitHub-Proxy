# github.gohj99.site 的 EdgeOne 边缘函数

部署文件是本目录的 `edge-function.js`。复制整个文件到腾讯云 **EdgeOne → 站点 → 边缘函数 → 函数管理**，使用 Hello World 模板创建函数，替换代码后创建并部署。入口为 `addEventListener("fetch", ...)`；此文件用于链接所指的站点边缘函数控制台。

## 域名和触发规则

先为下表全部域名配置 EdgeOne 加速接入、DNS 和 HTTPS 证书，再把这些 Host 的所有路径绑定到同一个函数。可以逐个创建 Host 等于规则，或使用控制台支持的 Host 集合条件。若使用 `*.github.gohj99.site` 泛域名规则，仍需单独添加 `github.gohj99.site`；多个“Host 等于”条件不要用 AND 连接。

| 访问域名 | HTTPS 回源 Host |
| --- | --- |
| github.gohj99.site | github.com |
| api.github.gohj99.site | api.github.com |
| raw.github.gohj99.site | raw.githubusercontent.com |
| camo.github.gohj99.site | camo.githubusercontent.com |
| docs.github.gohj99.site | docs.github.com |
| gist.github.gohj99.site | gist.github.com；`/用户/ID/raw/…` 使用 gist.githubusercontent.com |
| assets.github.gohj99.site | github.githubassets.com |
| avatars.github.gohj99.site | avatars.githubusercontent.com |
| objects.github.gohj99.site | objects.githubusercontent.com |
| codeload.github.gohj99.site | codeload.github.com |
| ghcr.github.gohj99.site | ghcr.io |
| gist-assets.github.gohj99.site | gist-assets.githubusercontent.com |
| user-images.github.gohj99.site | user-images.githubusercontent.com |
| private-user-images.github.gohj99.site | private-user-images.githubusercontent.com |
| release-assets.github.gohj99.site | release-assets.githubusercontent.com |
| github-releases.github.gohj99.site | github-releases.githubusercontent.com |

只绑定主域名会导致替换后的资源链接无法使用。函数直接请求上表中的 GitHub HTTPS 源站；如果控制台要求源站地址，可以沿用现有 OpenResty 源站。不要把加速域名本身配置成它自己的源站。

## 本地文件

`robots.txt`、`static/content-blocked.html` 和 `static/github-hook.js` 都不经过这个函数。所有已配置代理域名请求这三个路径都会 Passthrough，由对应站点源站特异性回源，便于单独更新文件且不受边缘函数缓存或正文改写影响。HTML 的 `<head>` 起始位置仍会加载 `static/github-hook.js`。

当前 `github.gohj99.site/index/` 没有 `index.html` 或 `favicon.ico`，所以 `/` 和 `/favicon.ico` 按 Nginx 的文件不存在回退逻辑访问 GitHub。入口站 `githubproxy.gohj99.site` 的首页不属于本函数。修改这三个文件后只需更新站点源站文件，不需要重新部署函数。

## 代理和替换

实现依据为 `proxy/root.conf` 和 `conf/00-ghproxy-global.conf`：包含全部源站映射、Gist raw 分流、路径拦截、`/https://github.com/…` 智能跳转，以及 Cookie/Authorization 透传限制。只有 API 透传 Cookie，API 和 GHCR 透传 Authorization；重定向采用手动模式，先替换目标再交给客户端。

HTML、CSS、JavaScript、JSON 采用流式域名替换，并处理跨块域名和 UTF-8 字符。Location、Refresh、Link、CORS 和 GHCR 认证 realm 中的链接也会替换；GHCR 的 service/scope 保持原值。HTML 中旧的脚本/样式 integrity 被移除，因为改写后的资源已不再匹配原摘要。

附件、二进制文件、Raw 的 `text/plain`、Range/206 和 GHCR 内容保持原始字节，避免破坏下载、断点续传或 OCI 摘要。HEAD、204、205、304 均保持无响应体。请求正文原样透传，API JSON 中的业务内容不会反向替换。

## 缓存与平台限制

使用 EdgeOne `caches.open()` 分为静态、动态命名空间，按访问 Host、路径、完整查询字符串隔离，保留 Vary 请求头差异。响应头 `X-Cache` 显示 `HIT`、`MISS`、`BYPASS`。

- API 携带 Authorization/Cookie、GHCR 携带 Authorization、Gist、签名链接和可变 codeload refs 均绕过缓存读取和写入。GHCR token、Range 和非 GET/HEAD 请求同样绕过。
- 尊重源站 Cache-Control、Expires、Set-Cookie、Vary；没有明确缓存期时，200 为 10 分钟、301 为 1 小时、404 为 1 分钟、403 为 30 秒。5xx 不写缓存。
- Cache API 不允许写入 206；超过 8 MiB 或没有 Content-Length 的响应直接流式转发，不制作缓存副本。此限制只影响缓存，不限制下载大小。
- EdgeOne Cache API 不等同于 Nginx 的磁盘缓存，未实现磁盘容量配额、缓存锁、后台刷新或故障时返回陈旧缓存。缓存服务异常时直接请求源站。
- 文档规定 `response.text()` 等整块读取最多 1 MB，因此本函数通过 reader/writer 流式处理；未使用 EdgeOne 会忽略的 TransformStream 转换器参数。
- 请求体上限为平台规定的 1 MB，CPU 时间为 200 ms、运行内存为 128 MB。读取/发送超时采用平台上限 300 秒，连接超时为 60 秒；不能使用 Nginx 的 600 秒读写超时。非常大的文本转换仍受平台 CPU 限制。
- 本函数不实现 WebSocket 升级，升级请求返回 501；如确实需要 GitHub 实时连接，应为相关路径配置独立的 EdgeOne/WebSocket 回源规则。常规仓库页面和下载走 HTTP 代理。

## 验证

```powershell
node --check github.gohj99.site/edge-function.js
node --test github.gohj99.site/edge-function.test.mjs
```

测试覆盖 16 个回源 Host、Gist raw、重定向查询参数、路径拦截、源站 Passthrough、凭据、跨块替换、超过 1 MB 的正文、gzip、附件/Range/GHCR 字节一致性、无响应体状态码及缓存隔离。已在本地用真实 GitHub 请求验证仓库页面、静态脚本、API、Raw 均返回 200；尚未在用户的 EdgeOne 账户内发布或验证节点行为。

部署后可访问 `https://github.gohj99.site/microsoft/vscode`，检查 Network 面板内的 `assets.github.gohj99.site` 等资源，再用 `https://github.gohj99.site/https://github.com/microsoft/vscode` 检查 301。ACME 如需续签，需另确认对应源站能返回验证文件。

## 参考文档

- [概述与使用限制](https://cloud.tencent.com/document/product/1552/81344)
- [addEventListener](https://cloud.tencent.com/document/product/1552/81928) / [FetchEvent](https://cloud.tencent.com/document/product/1552/81899)
- [Fetch 与超时](https://cloud.tencent.com/document/product/1552/81897) / [Cache](https://cloud.tencent.com/document/product/1552/81893)
- [Response 的 1 MB 限制](https://cloud.tencent.com/document/product/1552/81917)
- [TransformStream](https://cloud.tencent.com/document/product/1552/81923) / [ReadableStream](https://cloud.tencent.com/document/product/1552/81914)
- [Passthrough 回源](https://cloud.tencent.com/document/product/1552/120717)
