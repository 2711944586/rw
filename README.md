# 软微 420 学习台

面向 2028 入学备考周期的学习执行工具。它负责把长期计划落到每日任务、学习记录、间隔复盘、考点证据、模考统计、资料版本和备份同步。

当前倒计时使用 `2027-12-25` 作为推算排程日，非官方初试日期。正式初试日期、招生简章、专业目录和考试科目必须以当年官方公告为准。420 分只作为内部校准线和风险控制线，不代表录取承诺。

## 技术栈

- 前端：Vite + 原生 HTML/CSS/JS
- 数据同步：Supabase Auth + Postgres + RLS
- 推荐部署：Vercel 静态前端
- 本地缓存：浏览器 `localStorage`
- Node 要求：Vite 7 需要 Node `^20.19.0` 或 `>=22.12.0`；CI 当前使用 Node 22

## 本地启动

先安装 Node.js LTS，然后在项目目录运行：

```powershell
npm install
npm run start:local
```

也可以双击 `start-local.bat`。脚本会从 5173 开始寻找可用端口，最终访问地址以终端输出的 `Ready: http://127.0.0.1:端口/` 为准。

不要直接双击 `index.html`。项目使用 Vite 模块和 Supabase SDK，直接打开文件会导致模块加载失败。

## 常用命令

```powershell
npm run start:local
npm run check
npm test
npm run build
npm run preview
npm run quality
```

- `start:local`：日常本机使用，自动找端口并打开网页。
- `check`：检查 JavaScript 语法。
- `test`：运行 Vitest 单元测试和性质测试。
- `build`：生成 `dist` 产物。
- `preview`：预览生产构建。
- `quality`：依次执行 check、test、build、audit。

## 项目结构

```text
.
├─ index.html                # 页面骨架和静态入口
├─ styles.css                # 视觉系统、工作台布局、响应式样式
├─ src/
│  ├─ main.js                # Vite 入口
│  ├─ app.js                 # 主界面渲染和交互编排
│  ├─ referenceData.js       # 官方来源、设计参考、执行边界
│  ├─ core/                  # 可拆分架构的路由、事件总线、状态适配层
│  ├─ domain/                # 计划、顺延、复盘、校准、来源等可测试领域逻辑
│  ├─ infrastructure/        # 可拆分架构的 Supabase 客户端和离线缓存
│  ├─ utils/                 # HTML 转义等通用工具
│  └─ views/                 # 可拆分页面视图，当前生产入口仍由 app.js 编排
├─ tests/
│  ├─ unit/                  # 单元测试
│  └─ properties/            # fast-check 性质测试
├─ supabase/
│  ├─ schema.sql             # 数据库表、RLS 和策略
│  └─ migrations/            # 增量迁移
├─ scripts/check-js.mjs      # JS 语法检查脚本
├─ pku_swm_420_plan.md       # 备考总控文档
├─ start-local.ps1           # Windows 本地启动脚本
├─ start-local.bat           # 双击启动入口
├─ package.json
└─ vite.config.js
```

生成目录不需要提交：`node_modules/`、`dist/`、`test-results/`、`playwright-report/`、`output/playwright/` 中的截图和日志。

## 部署总览

推荐零基础先看：

- API 密钥获取和填写清单：[docs/API_KEYS_CHECKLIST.md](docs/API_KEYS_CHECKLIST.md)
- 全自动部署流程：[docs/AUTO_DEPLOY.md](docs/AUTO_DEPLOY.md)

已经准备好的自动化命令：

```powershell
npm run deploy:all   # 部署 Preview，默认安全入口
npm run deploy:prod  # 部署 Production
```

自动化脚本会读取本机 `.env.deploy`，执行质量检查、Supabase schema、GitHub push、Vercel 环境变量和部署，并做上线健康检查。先复制 `.env.deploy.example`：

```powershell
Copy-Item .env.deploy.example .env.deploy
notepad .env.deploy
```

`.env.deploy` 只放在本机，不要提交。生产部署后仍需在 Supabase `Authentication -> URL Configuration` 中核对生产域名。

推荐顺序：

1. 本地安装依赖并通过质量检查。
2. 创建 Supabase 项目，执行数据库 schema。
3. 配置 Supabase Auth。
4. 准备 GitHub 仓库。
5. 在 Vercel 导入项目并配置环境变量。
6. 部署后把生产域名写回 Supabase Auth URL 设置。
7. 做上线验收：页面、登录、同步、备份、移动端。

## 1. 上线前本地检查

确认 Node 版本满足 Vite 7 要求：

```powershell
node --version
npm --version
```

安装依赖并执行完整检查：

```powershell
npm install
npm run quality
```

`npm run quality` 必须全部通过。它会执行：

```text
npm run check
npm test
npm run build
npm audit --audit-level=moderate
```

本地预览生产构建：

```powershell
npm run build
npm run preview
```

默认预览地址是 `http://127.0.0.1:4173/`。如果终端输出了其他端口，以终端为准。

## 2. 创建 Supabase 项目

1. 打开 Supabase Dashboard。
2. 选择组织，点击 `New project`。
3. 填写项目名、数据库密码和区域。
4. 等待项目初始化完成。

区域建议选择离主要使用地更近的区域。数据库密码要单独保存，不要写入仓库。

## 3. 执行数据库 Schema

1. 进入 Supabase 项目。
2. 打开左侧 `SQL Editor`。
3. 新建 Query。
4. 打开本项目的 `supabase/schema.sql`。
5. 复制全部 SQL 并执行。

执行后应创建这些核心表：

```text
profiles
daily_records
study_tasks
review_items
topic_progress
mock_scores
resources
snapshots
conflicts
calibration_snapshots
project_showcase_items
```

所有用户数据表都应启用 RLS。策略必须保证用户只能访问自己的 `user_id = auth.uid()` 数据。

如果是旧 Supabase 项目，先确认已经按顺序执行 `supabase/migrations/` 中的迁移，至少包含 `010_profile_plan_defaults.sql`。新项目直接执行完整 `supabase/schema.sql` 即可。

## 4. 配置 Supabase Auth

打开 Supabase 项目中的 `Authentication`。

在 `Providers` 中确认 `Email` 已启用。本项目使用邮箱密码登录：

```text
supabase.auth.signUp({ email, password })
supabase.auth.signInWithPassword({ email, password })
```

开发阶段可以按需要关闭邮箱确认；正式长期使用建议开启邮箱确认。

在 `URL Configuration` 中先配置本地地址：

```text
Site URL: http://127.0.0.1:5173
Redirect URLs:
http://127.0.0.1:5173/**
http://localhost:5173/**
```

如果本地脚本启动在其他端口，例如 5174，也把对应地址加入 Redirect URLs。上线后还要把 Vercel 生产域名加入这里，见第 9 节。

## 5. 获取 Supabase 环境变量

在 Supabase 项目中打开 `Project Settings` -> `API`，复制：

```text
Project URL
Publishable key
```

本地新建 `.env`：

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

注意：

- 变量名必须以 `VITE_` 开头，否则 Vite 不会暴露给浏览器端代码。
- 这里只能使用 Supabase publishable key。
- 不要把 `service_role` key、数据库密码、JWT secret 放进前端项目。
- `.env` 已被 `.gitignore` 忽略，不要提交。

配置后重启本地 Vite：

```powershell
npm run start:local
```

打开网页，点击右上角“账号”，用邮箱密码注册或登录，确认没有出现“Supabase is not configured.”。

## 6. 准备 GitHub 仓库

确认工作区中不包含生成物和密钥：

```powershell
git status
```

不要提交这些内容：

```text
.env
node_modules/
dist/
test-results/
playwright-report/
output/playwright/*.png
output/playwright/*.log
```

提交前再次执行：

```powershell
npm run quality
git status
```

提交并推送：

```powershell
git add .
git commit -m "prepare production deployment"
git push origin main
```

如果仓库主分支叫 `master`，把上面的 `main` 换成 `master`。

## 7. Vercel Dashboard 部署

1. 打开 Vercel Dashboard。
2. 点击 `Add New...` -> `Project`。
3. 选择 GitHub 仓库。
4. Framework Preset 选择 `Vite`。
5. Root Directory 保持项目根目录。如果仓库根目录不是本项目，请改成 `rw`。
6. Build and Output Settings 使用：

```text
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

如果 Vercel 自动使用 `npm install`，可以保持默认。不要把 Output Directory 写成 `public` 或项目根目录。

## 8. 配置 Vercel 环境变量

在导入项目页面或项目创建后的 `Settings` -> `Environment Variables` 中添加：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

值与本地 `.env` 一致。

建议同时勾选这些环境：

```text
Production
Preview
Development
```

保存环境变量后触发部署。如果是部署后才添加变量，需要进入 `Deployments`，对最新部署执行 `Redeploy`。Vite 会在构建时读取环境变量；不重新部署，线上包不会带上新变量。

## 9. 配置 Supabase 生产回调地址

Vercel 部署成功后会得到生产域名，例如：

```text
https://your-project.vercel.app
```

回到 Supabase：

1. 打开 `Authentication` -> `URL Configuration`。
2. `Site URL` 填生产域名：

```text
https://your-project.vercel.app
```

3. `Redirect URLs` 加入：

```text
https://your-project.vercel.app/**
```

如果配置了自定义域名，也加入：

```text
https://your-domain.com/**
```

保存后等待几十秒再测试登录。

## 10. 上线验收清单

打开生产域名，按顺序检查：

1. 页面能正常打开，不是空白页。
2. 顶部“账号”可以打开登录弹窗。
3. 新邮箱可以注册，已有邮箱可以登录。
4. 保存一条今日记录，刷新页面后记录仍在。
5. 点击“同步”没有报错。
6. 在 Supabase Table Editor 中能看到当前用户对应的数据行。
7. 退出登录后，本机草稿仍能使用。
8. 手机端打开页面，没有横向滚动；底部导航可切换到记录、复盘、资料、设置。
9. 资料页、考纲页能看到“非官方指定资料”“官方范围映射 / 预备能力 / 备考补充”等边界说明。

浏览器控制台不应有红色错误。如果有错误，优先检查第 8、9 节的环境变量和 Auth URL。

## 11. 可选：Vercel CLI 部署

如果使用命令行部署，先安装并登录：

```powershell
npm install -g vercel
vercel login
```

首次关联项目：

```powershell
vercel
```

按提示选择当前目录、团队和项目。然后添加环境变量：

```powershell
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
vercel env add VITE_SUPABASE_URL preview
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY preview
```

生产部署：

```powershell
vercel --prod
```

CLI 部署完成后，同样要把最终生产域名加入 Supabase Auth URL Configuration。

## 12. 常见问题

### 页面空白

先确认没有直接打开 `index.html`。本地必须使用：

```powershell
npm run start:local
```

线上检查 Vercel 的 Build Log，确认 `npm run build` 成功，Output Directory 是 `dist`。

### 线上提示 Supabase 未配置

检查 Vercel 环境变量是否存在且拼写完全一致：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

添加或修改环境变量后必须 Redeploy。

### 登录后跳转或确认邮件链接异常

检查 Supabase `Authentication` -> `URL Configuration`：

```text
Site URL
Redirect URLs
```

生产域名、本地端口、自定义域名都要加入。域名必须带协议：`https://` 或 `http://`。

### 登录成功但读写失败

检查：

- 是否执行了完整 `supabase/schema.sql`。
- 表是否启用 RLS。
- 当前用户是否已登录。
- 表中的 `user_id` 是否等于当前 `auth.uid()`。

### 本地有数据，登录后怕覆盖

首次发现旧本地数据时，先导出 JSON 备份，再选择是否导入云端。不要在没有备份的情况下反复导入。

## 数据规则

未登录时，数据保存在当前浏览器 `localStorage`。登录后，页面先即时更新，再异步同步到 Supabase。断网或同步失败时继续保留本机草稿，恢复网络后可点击顶部“同步”。

建议每周导出一次 JSON；月复盘后、大量修改考点状态前，额外导出一次。

## 学习系统边界

- 每日任务默认 3 项，最多 4 项；顺延或底线日可降到 2 项。
- 数学一和 408 默认占核心时间 65%。
- 未完成任务自动顺延，并减少当天新增任务；顺延或底线日可降到 2 项，避免补偿式超载。
- 到期复盘每天最多压入 1 项必做，其余保留在复盘队列。
- 考点没有题量、正确率或交付证据，不能直接标为已掌握。
- 2027 年 9-10 月必须重新核验招生说明、专业目录、考试科目、招生人数、报名要求和初试日期。

## 官方基准

当前考试科目信息只以北大软微 2026 年已发布说明为备考基准：085400 电子信息专业计划招生 583 名、拟接收推荐免试生 255 名；01-04 方向考 101、201、301、408，并统一划线排名，04 方向含未来技术学院代招说明。2026 复试线总分 378 只作历史参考，不用于预测 2028。

考纲页采用“官方范围映射 / 预备能力 / 备考补充”分层展示；条目是备考拆解，不等同官方逐字大纲。资料页中的王道、天勤、李林、肖八、肖四等均按非官方指定资料处理，未来年份资料以当年最新版出版后确认。

## 参考官方文档

- Vite 环境变量：`https://vite.dev/guide/env-and-mode`
- Vercel Vite 部署：`https://vercel.com/docs/frameworks/vite`
- Vercel 环境变量：`https://vercel.com/docs/environment-variables`
- Supabase JavaScript 初始化：`https://supabase.com/docs/reference/javascript/initializing`
- Supabase Auth Redirect URLs：`https://supabase.com/docs/guides/auth/redirect-urls`
- Supabase RLS：`https://supabase.com/docs/guides/database/postgres/row-level-security`
