# CDN 多源站回源测试

这个目录用于公开测试 CDN 的源站组、按路径回源和缓存行为。下面 7 条测试路径已经预先配置为分别使用对应的逻辑源站，直接访问即可。每个文件都带有独立的测试标识，便于确认请求是否返回了预期内容。

测试目录：[GitHub-Proxy/test](https://github.gohj99.site/gohj99/GitHub-Proxy/tree/master/test)

## 测试链接

1. [Netlify 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/blob/master/test/netlify.md)
2. [ESA 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/blob/master/test/esa.md)
3. [Deno 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/blob/master/test/deno.md)
4. [Vercel 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/blob/master/test/vercel.md)
5. [服务器 1 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/blob/master/test/server-1.md)
6. [服务器 2 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/blob/master/test/server-2.md)
7. [服务器 3 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/blob/master/test/server-3.md)

## 建议测试方法

逐个访问上面的 URL。使用浏览器时可以查看响应头中的 CDN 缓存状态和回源信息；使用命令行时可以执行：

```bash
curl -i https://github.gohj99.site/gohj99/GitHub-Proxy/blob/master/test/netlify.md
```

同一个 URL 连续请求两次，可以观察首次回源和后续缓存命中。需要区分缓存请求时，可以附加查询参数，例如：

```text
https://github.gohj99.site/gohj99/GitHub-Proxy/blob/master/test/netlify.md?check=2
```

查询参数只用于区分缓存键，不代表源站路径发生变化。

## 判定标准

- 页面正文中的测试标识与链接对应的逻辑源站一致。
- HTTP 状态码为 `200`。
- 响应头中的 CDN 命中状态符合预期。
- 连续请求时，缓存命中和回源次数符合 CDN 的缓存策略。
- 源站发生故障时，已配置故障切换的路径应转到备用源站。

这些文件只用于 CDN 回源验证，不承载业务逻辑，也不应作为正式站点首页使用。
