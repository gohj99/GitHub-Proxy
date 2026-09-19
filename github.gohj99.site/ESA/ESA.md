# github.gohj99.site 的阿里云 ESA 函数

部署文件是本目录的 [`edge-function.js`](edge-function.js)。它将 EdgeOne 版本的 GitHub 多域名代理规则移植到阿里云 ESA Functions，入口符合 ESA Runtime API：

```js
export default {
  fetch(request) {
    return handleRequest(request);
  },
};
```

## 部署

在 ESA **函数和 Pages** 中创建函数或 Pages 项目，将函数入口设置为 `github.gohj99.site/ESA/edge-function.js`（如果使用 Pages 仓库，建议复制到项目内的 `src/index.js`，并在 `esa.jsonc` 的 `entry` 字段指定该文件）。不要把该文件作为 EdgeOne 函数直接粘贴，两个平台的入口不同。

为下表的每一个代理域名配置 ESA 加速接入、DNS 和 HTTPS 证书，然后将所有路径绑定到同一个函数。`github.gohj99.site` 也必须单独绑定，不能只配置泛域名。

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

如果用 Pages 托管 `robots.txt`、`static/content-blocked.html` 和 `static/github-hook.js`，应将这些文件放进 assets 目录。ESA Pages 会在函数前优先返回匹配的静态资源；独立函数部署则应为这些路径配置更高优先级的源站/静态路由。

## 与 EdgeOne 的差异

- ESA 函数入口是 ES Module 的 `export default { fetch(request) {} }`，不是 `addEventListener("fetch", ...)`。
- ESA Fetch 文档规定 `Host`、`Connection`、`Upgrade`、`TE` 等请求头禁止读写，因此代码不再尝试设置回源 `Host`；Fetch URL 的域名决定回源 Host。
- ESA Fetch 默认会解压 gzip。本文件显式使用 `decompress: "manual"`，保留压缩响应后再按正文类型进行流式解压和域名改写。
- ESA Cache API 使用全局 `cache.get(url)`、`cache.put(url, response)`，缓存键使用 HTTP URL（ESA Cache API 当前不接受 HTTPS 键）。缓存异常会自动回源。
- ESA 单次函数最多 4 个 Fetch 子请求，缓存读/写也占用子请求额度；本实现每次最多一次缓存读取、一次源站请求和一次缓存写入。
- ESA 函数不适合 WebSocket 升级；需要实时连接时应为相关路径配置独立的 ESA/WebSocket 回源规则。

## 验证

```powershell
node --check github.gohj99.site/ESA/edge-function.js
node --test github.gohj99.site/EdgeOne/edge-function.test.mjs
```

第二条命令继续验证代理规则、重写、缓存策略和正文流处理；ESA 入口的最小本地 smoke test 可以用 Node 的 Web Fetch API 模拟（平台自身的 Cache API 和节点行为仍需在 ESA 测试环境验证）。

参考：

- [函数和 Pages](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/what-is-functions-and-pages)
- [Pages 构建和路由](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/build-pages)
- [Fetch API](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/fetch-1)
- [Runtime API 手册](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/runtimeapi-manual)
- [Cache API](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/cache-api)
