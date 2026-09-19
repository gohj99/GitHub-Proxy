# Vercel Edge 部署

本目录是一个可独立部署的 Vercel 项目。`api/proxy.js` 使用 Vercel Edge Runtime，代理行为与
`../EdgeOne/edge-function.js` 一致；`public/` 保存不经过代理的站点文件。

## 部署

1. 把整个 `vercel` 文件夹上传到新的 Vercel 项目，Framework Preset 选择 **Other**。
2. Build Command、Output Directory 和 Install Command 均留空，不需要环境变量。
3. 在项目的 **Settings → Domains** 中添加下列全部域名，并按 Vercel 提示配置 DNS。
4. 部署完成后，用 `https://github.gohj99.site/microsoft/vscode` 验证仓库页面。

必须把主域名和全部资源子域名指向同一个项目：

| Vercel 自定义域名 | GitHub 上游 |
| --- | --- |
| github.gohj99.site | github.com |
| api.github.gohj99.site | api.github.com |
| raw.github.gohj99.site | raw.githubusercontent.com |
| camo.github.gohj99.site | camo.githubusercontent.com |
| docs.github.gohj99.site | docs.github.com |
| gist.github.gohj99.site | gist.github.com / gist.githubusercontent.com |
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

Vercel 自动生成的 `*.vercel.app` 域名不在代理 Host 白名单内，访问时返回 404；请用配置好的
自定义域名测试。只配置主域名会导致页面中的 CSS、JavaScript、头像和下载链接不可用。

## 平台适配

- 使用标准 `export default (request) => Response` 入口和 `runtime: "edge"`，不依赖 EdgeOne 的
  `addEventListener`、`request.eo`、超时选项或命名 Cache API。
- `vercel.json` 先匹配 `public/` 静态文件，再把其他路径交给边缘函数；官方
  `request.path` transform 让函数继续看到原始 pathname，查询字符串不会被解析或重组。
- 安全的公开响应通过 `Vercel-CDN-Cache-Control` 设置 CDN TTL；API、GHCR、Gist、签名参数、
  Range 和可变 codeload refs 均为 `no-store`。API/GHCR 整体不缓存是有意的安全收紧，防止
  Vercel 的共享 CDN 缓存混用匿名响应与带凭据请求。CDN 是否命中可查看响应头
  `x-vercel-cache`。
- HTML、CSS、JavaScript 和 JSON 继续流式替换域名。附件、二进制、Raw text、Range/206 和
  GHCR 内容保持原始字节。
- Vercel Edge Function 不用于 WebSocket 转发，Upgrade 请求返回 501。

## 本地检查

需要 Node.js 18 或更高版本：

```powershell
cd github.gohj99.site/vercel
npm test
npx vercel dev
```

`vercel dev` 启动后仍需要用代理域名作为 Host 才会命中映射。例如：

```powershell
curl.exe -H "Host: github.gohj99.site" http://localhost:3000/microsoft/vscode
```
