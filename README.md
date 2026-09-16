# GitHub 镜像站

主站：`github.gohj99.site`；入口站：`githubproxy.gohj99.site`。

首页位于 `githubproxy.gohj99.site/index/index.html`，提供 SEO 信息、GitHub 地址跳转与常用导航；`github.gohj99.site/proxy/root.conf` 是 OpenResty/Nginx 反向代理规则。

本站仅用于访问 GitHub 公开内容，请遵守 GitHub 服务条款及当地法律法规。

## EdgeOne 边缘函数

可直接粘贴部署的单文件：[edge-function.js](github.gohj99.site/edge-function.js)。使用站点边缘函数的 `addEventListener("fetch", ...)` 入口，已内嵌现有 robots、内容拦截脚本和拦截页面，无需运行时依赖。

具体域名、部署步骤、缓存策略和平台差异见 [部署说明](github.gohj99.site/EDGEONE.md)。
