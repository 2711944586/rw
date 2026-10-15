# 基线

记录日期：2026-10-10。对照提交是 `4f77722723122ca356414a3acea55b05e25feb9b`。本轮改动还在工作区，没有推送，也没有再次部署。

- 生产入口仍是 `src/main.js` → `src/app.js`。技术栈保持 Vite、原生 JS/HTML/CSS 和 Supabase。
- 既有 Hash 路由保留：`#dashboard #today #week #foundation #syllabus #records #review #scores #resources #settings`。
- 浏览器状态键仍是 `pku_swm_420_dashboard_v3`。模式版本仍是 4。旧的 `focus` 密度读入后写成 `balanced`。
- 客户端只使用可发布的 Supabase key。服务端密钥不进入 `src/`。
- 线上 `https://rw-vert.vercel.app` 在 2026-10-10 的部署已核对响应头：CSP、`nosniff`、referrer、`X-Frame-Options: DENY`、HSTS、Permissions-Policy。那次核对的构建标记是 `2026-10-10-workbench-v4.2.0`。
- 迁移 `018_density_mode_balanced.sql` 已在线上执行。当时 `profiles.density_mode` 默认值是 `balanced`，`focus` 行数为 0。
- 两个账号互相读取对方数据的 RLS 演练没有做。本文件不把它记成已通过。
- LCP、INP、CLS 没有测量。本文件不报告这三项数字。

本机 Node 以当时环境为准。依赖以仓库 `package-lock.json` 为准。包版本号在本轮改为 `4.2.0`，与 `src/config/app-config.js` 里的构建标记对齐。
