# CDN 多源站回源测试

这个目录用于测试 CDN 的源站组、按路径指定源站，以及源站故障切换。

请先在 CDN 控制台配置规则，使下面 7 个 URL 分别回源到对应的逻辑源站。配置完成后访问链接，检查页面内容中的“期望源站”是否与实际配置一致。每个文件的内容都带有独立的测试标识，便于确认 CDN 是否命中了正确的源站。

## 测试链接

1. [Netlify 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/test/netlify.md)
2. [ESA 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/test/esa.md)
3. [Deno 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/test/deno.md)
4. [Vercel 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/test/vercel.md)
5. [服务器 1 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/test/server-1.md)
6. [服务器 2 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/test/server-2.md)
7. [服务器 3 源站](https://github.gohj99.site/gohj99/GitHub-Proxy/test/server-3.md)

## 建议测试方法

先清理或绕过 CDN 缓存，再逐个访问上面的 URL。使用浏览器时查看响应头中的 CDN 缓存状态、命中的规则和回源信息；使用命令行时可以执行：

```bash
curl -i https://github.gohj99.site/gohj99/GitHub-Proxy/test/netlify.md
```

同一个 URL 连续请求两次，用来观察首次回源和后续缓存命中。修改 CDN 源站规则后，建议使用新的查询参数再次测试，例如：

```text
https://github.gohj99.site/gohj99/GitHub-Proxy/test/netlify.md?check=2
```

查询参数只用于区分缓存键，不代表源站路径发生变化。

## 判定标准

- 页面正文中的测试标识与当前 CDN 规则的目标源站一致。
- HTTP 状态码为 `200`。
- 响应头中的 CDN 命中状态符合预期。
- 连续请求时，缓存命中和回源次数符合 CDN 的缓存策略。
- 临时停止某个源站后，配置了故障切换的规则应转到备用源站。

这些文件只用于 CDN 回源验证，不承载业务逻辑，也不应作为正式站点首页使用。
