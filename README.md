# MyTV

在线影视聚合平台：Cloudflare Workers（OpenNext）+ D1 + 苹果CMS 采集源；前端与后台界面自研。

- 设计基线：`docs/01-总体设计方案.md`（15 条拍板结论）
- UI 设计：`docs/02-UI设计提案.md`（A 暗夜影院，18 张高保真稿见 `docs/design/`）
- 实施清单：`docs/03-M0`（骨架）、`docs/04-M1`（数据层）、`docs/05-M2`（前台）、`docs/06-M3`（缓存+熔断）、`docs/07-M4`（后台管理），核心里程碑 M0–M4 均已完成

## 开发

```bash
pnpm install
pnpm dev        # 本地开发（Next.js）
pnpm preview    # OpenNext 构建 + Workers 本地预览
pnpm deploy     # 部署到 Cloudflare Workers
```

环境变量见 `.env.example`（本地）与 `wrangler.toml`（部署）。

## 开源义务

本项目为 **AGPL-3.0-or-later**。服务端部分移植自 [LibreSpark/LibreTV](https://github.com/LibreSpark/LibreTV)（AGPL-3.0）；以网络服务形式对外提供时，须向使用者提供对应源码。
