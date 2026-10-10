# 基线

记录日期：2026-10-10。

- 升级开始时的 `HEAD`：`55e68c0d7d651fb58cf978cad73abc74f5d55640`（Automated deployment）。
- 本机 Node：v24.11.1。依赖以仓库 `package-lock.json` 为准。
- 生产入口仍是 `src/main.js` → `src/app.js`。技术栈保持 Vite、原生 JS/HTML/CSS 和 Supabase。
- 既有 Hash 路由保留：`#dashboard #today #week #foundation #syllabus #records #review #scores #resources #settings`。
- 浏览器状态键仍是 `pku_swm_420_dashboard_v3`。模式版本升到 4。旧的 `focus` 密度读入后写成 `balanced`。
- 客户端只使用可发布的 Supabase key。服务端密钥不进入 `src/`。

2026-10-10 在本机实际跑过的命令：

- `npm test`：50 个文件、775 个测试通过。
- `npm run check`、`npm run typecheck`、`npm run test:boundaries`、`npm run test:css-debt`、`npm run test:palette` 通过。
- `npm run build` 通过。

尚未在这份记录里声称通过的项目：生产响应头实测、Supabase RLS 跨账号实测、五个宽度的全路由截图归档、把迁移 018 应用到线上数据库。
