# MyTV

在线影视聚合平台：Cloudflare Workers（OpenNext）+ D1 + 苹果CMS 采集源（JSON/XML 接口自适应，兼容海洋CMS、飞飞CMS 等 RSS 5.1 形态）；前端与后台界面自研。

- 设计基线：`docs/01-总体设计方案.md`（15 条拍板结论）
- UI 设计：`docs/02-UI设计提案.md`（A 暗夜影院，18 张高保真稿见 `docs/design/`）
- 实施清单：`docs/03-M0`（骨架）、`docs/04-M1`（数据层）、`docs/05-M2`（前台）、`docs/06-M3`（缓存+熔断）、`docs/07-M4`（后台管理）、`docs/08-M5`（直播 IPTV），规划里程碑 M0–M5 全部完成

## 开发

```bash
pnpm install
pnpm dev        # 本地开发（Next.js）
pnpm preview    # OpenNext 构建 + Workers 本地预览
pnpm deploy     # 部署到 Cloudflare Workers
```

环境变量见 `.env.example`（本地）与 `wrangler.toml`（部署）。

## 部署方案（域名 / 触发器）

线上入口（并存，互不顶掉）：

- `https://mytvverse.xyz` / `https://www.mytvverse.xyz` —— 自定义域（`wrangler.toml` 中 `routes` 配置，Workers 自动建 DNS 记录并签发证书）
- `https://mytv.soldors1.workers.dev` —— workers.dev 默认域（`workers_dev = true` **必须显式声明**：实测配置 `routes` 后若不声明，部署会静默关掉 workers.dev 触发器导致该入口全站 404）

自定义域接入步骤（注册商 → Cloudflare）：

1. Cloudflare Dashboard「Add a domain」添加域名，选 Free 计划，记下分配的两个 `*.ns.cloudflare.com`；
2. 到注册商（本站为阿里云：域名控制台 → 管理 → DNS 修改）把默认 NS 替换为这两个，等待 zone 激活（`.xyz` 一般几分钟到 1 小时）；
3. `wrangler.toml` 的 `routes` 加入该域名（`custom_domain = true`），`pnpm deploy` 即完成绑定。

域名无需备案：站点内容与 Workers 计算均在海外节点，国内解析到 Cloudflare 边缘网络即可访问（workers.dev 域名受 SNI 阻断，自定义域不受影响，这也是接入的主要动机）。

## 开源义务

本项目为 **AGPL-3.0-or-later**。服务端部分移植自 [LibreSpark/LibreTV](https://github.com/LibreSpark/LibreTV)（AGPL-3.0）；以网络服务形式对外提供时，须向使用者提供对应源码。
