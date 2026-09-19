# Deno Deploy 版 GitHub 代理

本目录是 `../EdgeOne/edge-function.js` 的 Deno Deploy 版本。入口文件是 `main.js`，不依赖 npm、JSR
或外部框架；上传整个 `Deno` 文件夹即可部署。

## 部署

1. 在 Deno Deploy 创建 Dynamic 应用并上传本目录，入口文件选择 `main.js`；安装和
   构建命令均留空。若控制台只允许关联 GitHub 仓库，请把本目录作为一个仓库的根目录。
2. 为应用绑定下表全部自定义域名，并按平台提示配置 DNS 和 HTTPS。
3. 部署后先访问 `https://github.gohj99.site/denoland/deno`，再检查浏览器 Network 面板里的
   `assets.github.gohj99.site`、`api.github.gohj99.site` 等请求。

上传时必须保留 `static/` 目录。HTML 会加载 `/static/github-hook.js`，`robots.txt`
和内容拦截页也由应用直接提供。

## 域名

| 访问域名                               | HTTPS 上游                                                        |
| -------------------------------------- | ----------------------------------------------------------------- |
| github.gohj99.site                     | github.com                                                        |
| api.github.gohj99.site                 | api.github.com                                                    |
| raw.github.gohj99.site                 | raw.githubusercontent.com                                         |
| camo.github.gohj99.site                | camo.githubusercontent.com                                        |
| docs.github.gohj99.site                | docs.github.com                                                   |
| gist.github.gohj99.site                | gist.github.com；`/用户/ID/raw/…` 转到 gist.githubusercontent.com |
| assets.github.gohj99.site              | github.githubassets.com                                           |
| avatars.github.gohj99.site             | avatars.githubusercontent.com                                     |
| objects.github.gohj99.site             | objects.githubusercontent.com                                     |
| codeload.github.gohj99.site            | codeload.github.com                                               |
| ghcr.github.gohj99.site                | ghcr.io                                                           |
| gist-assets.github.gohj99.site         | gist-assets.githubusercontent.com                                 |
| user-images.github.gohj99.site         | user-images.githubusercontent.com                                 |
| private-user-images.github.gohj99.site | private-user-images.githubusercontent.com                         |
| release-assets.github.gohj99.site      | release-assets.githubusercontent.com                              |
| github-releases.github.gohj99.site     | github-releases.githubusercontent.com                             |

只绑定主域名不够：正文中的 GitHub 资源地址会被改写成相应的代理子域名。 Deno Deploy 自动生成的
`*.deno.dev` 域名不在允许列表内，会返回 404；请用绑定后的 自定义域名验证完整代理。

## 行为和差异

- 保留 EdgeOne 版本的 Host 映射、Gist raw 分流、危险路径拦截、智能 URL 跳转、 Cookie/Authorization
  限制、重定向头改写和流式 HTML/CSS/JS/JSON 域名替换。
- 二进制、附件、Raw `text/plain`、Range/206 和 GHCR 内容不做正文替换。
- 缓存使用新 Deno Deploy 内置 CDN，通过 `Deno-CDN-Cache-Control` 设置边缘 TTL， 并继续尊重源站
  `Cache-Control`、`Expires`、`Set-Cookie` 和 `Vary`。以平台返回的 `Cache-Status`
  判断命中；敏感请求会强制 `private, no-store`，API/GHCR 匿名缓存也会按凭据头隔离。
- EdgeOne 的源站 Passthrough 在 Deno Deploy 中不存在，因此三个本地文件改由本应用提供； ACME
  challenge 路径返回 404，应由 Deno Deploy 的自定义域名证书功能处理。
- WebSocket 升级返回 501。普通 GitHub 页面、API、Raw、归档下载和 GHCR HTTP 请求可用。

## 本地验证

安装 Deno 后，在本目录执行：

```powershell
deno task check
deno task test
deno task dev
```

本地服务默认监听 8000 端口。因为代理按 Host 选上游，可这样请求：

```powershell
curl.exe -H "Host: github.gohj99.site" http://127.0.0.1:8000/denoland/deno
```

入口使用 Deno 官方的 `Deno.serve()`，平台直接用 `deno run main.js` 启动：

- <https://docs.deno.com/runtime/fundamentals/http_server/>
- <https://docs.deno.com/runtime/fundamentals/http_server/#responding-with-a-stream>
- <https://docs.deno.com/deploy/reference/caching/>
