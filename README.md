# 软微 420 学习台

面向北大软微备考周期的本地优先学习执行工具。系统把长期规划落到每日任务、学习记录、间隔复盘、考点证据、模考统计、资料版本和可选云同步。

当前倒计时使用 `2027-12-25` 作为推算排程日，并非官方初试日期。招生简章、专业目录、考试科目和正式日期始终以当年官方公告为准；420 分仅作为内部校准线，不代表录取承诺。

当前计划从 `2026-08-31` 开始，以 `2200h` 有效学习作为过程校准量。专注、平衡、详尽分别对应行动、执行和诊断三个信息层级；完整计划和经验样本边界见 [docs/STUDY_PLAN.md](docs/STUDY_PLAN.md)。

## 一键看效果

环境要求：Node.js `^20.19.0` 或 `>=22.12.0`，推荐 Node 22。

双击项目根目录的 `start-local.bat`。脚本会在缺少 `node_modules` 时安装依赖，启动本机 Vite，并打开浏览器。如果 `127.0.0.1:5173` 已经是这个学习台，它只打开现有页面，不另起一套服务。

```powershell
npm run start:local
```

终端打印 `Ready: http://127.0.0.1:端口/` 后即可审核当前改动。不要直接双击 `index.html`。页面依赖 Vite 模块加载，必须通过开发或预览服务运行。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run start:local` | 安装缺失依赖、寻找端口并打开本地页面 |
| `npm run dev` | 启动固定开发服务（`127.0.0.1:5173`） |
| `npm run clean` | 删除构建、覆盖率、截图和浏览器测试产物 |
| `npm run check` | 运行 ESLint 静态检查，包括未使用代码和未定义变量 |
| `npm run typecheck` | 按 `jsconfig.json` 对 config、core、data、domain、infrastructure、utils 执行 `tsc --noEmit` |
| `npm test` | 运行 Vitest 单元测试与性质测试 |
| `npm run test:props` | 只运行 `tests/properties/` 下的性质测试 |
| `npm run test:watch` | 以监听模式运行 Vitest |
| `npm run test:coverage` | 运行测试并生成覆盖率报告，低于 `vite.config.js` 里的覆盖率阈值即失败（不在 `quality` 链中） |
| `npm run test:palette` | 配色门禁：`src/styles/` 不得重新引入已淘汰的绿色系 |
| `npm run test:browser` | 使用真实 Chromium 验证关键页面和响应式布局 |
| `npm run test:study-plan-ui` | 学习计划页面的结构与交互门禁 |
| `npm run test:budget` | 校验 `dist/assets` 各 chunk 的 gzip 体积预算（需先 `npm run build`） |
| `npm run test:csp` | 用 `vercel.json` 的真实响应头托管 `dist/`，遍历全部路由断言零 CSP 违规（需先 `npm run build`） |
| `npm run test:boundaries` | 校验 `src/main.js` 的模块可达性与 `PENDING_MIGRATION` 清单一致 |
| `npm run test:css-debt` | `!important` 棘轮：逐文件比对上限，只降不升 |
| `npm run build` | 生成 `dist/` 生产产物 |
| `npm run preview` | 本地预览生产产物（`127.0.0.1:4173`） |
| `npm run quality` | 执行静态检查、类型检查、调色板、测试、浏览器门禁、构建、体积预算和依赖审计全套门禁 |
| `npm run verify:production` | 对已部署地址执行生产验证，需传入 URL |
| `npm run deploy:all` | 部署到 Vercel Preview |
| `npm run deploy:prod` | 部署到 Vercel Production |

## 项目结构

```text
.
├─ start-local.bat                  # 根目录双击启动
├─ index.html                       # 页面语义骨架与 Vite HTML 入口
├─ src/
│  ├─ main.js                       # 启动入口与故障恢复壳
│  ├─ app.js                        # 当前生产应用编排入口
│  ├─ config/
│  │  └─ app-config.js              # 倒计时日期、计划起点等应用常量
│  ├─ core/                         # 状态、事件、路由与共享契约
│  │  ├─ event-bus.js
│  │  ├─ state-manager.js
│  │  ├─ router.js                  # 渐进迁移层路由，暂未接管生产
│  │  ├─ route-contract.js          # 路由 ID 与移动端主入口的权威定义
│  │  └─ storage-contract.js        # 存储键的权威定义
│  ├─ data/
│  │  ├─ reference-data.js          # 来源、设计参考和执行边界静态数据
│  │  ├─ study-content.js           # 阶段、月计划、考纲、验收和任务蓝图
│  │  ├─ detailed-study-plan.js     # 逐月逐周细化计划
│  │  └─ study-plan-governance.js   # 阶段门、资料治理与偏差校正规则
│  ├─ domain/                       # 无 UI 的计划、复盘、校准和任务规则
│  ├─ infrastructure/
│  │  ├─ supabase-sync.js           # 当前生产同步实现
│  │  ├─ supabase-client.js         # 迁移层客户端，生产同步不使用它
│  │  ├─ sync-service.js            # 渐进迁移层同步实现，暂未接管生产
│  │  ├─ recovery-store.js          # IndexedDB 恢复镜像
│  │  ├─ offline-cache.js           # 本地缓存与待同步队列
│  │  ├─ browser-storage.js         # localStorage 容错封装
│  │  └─ sync-contract.js           # 同步表与冲突键的权威定义
│  ├─ ui/                           # 工作台、密度、图标和模板控制器
│  ├─ views/                        # 渐进模块化页面实现
│  ├─ styles/
│  │  ├─ base.css                   # 既有组件与兼容样式层
│  │  ├─ workspace.css              # 工作台视觉、材质和响应式覆盖层
│  │  ├─ components/                # 跨页面控件：toolbar.css、auth.css
│  │  └─ views/                     # 单页样式：study-plan.css
│  └─ utils/                        # HTML 和数值等无状态工具
├─ tests/
│  ├─ unit/                         # 单元测试与源码契约
│  ├─ integration/                  # 挂载真实 index.html 的生产流程测试
│  ├─ support/                      # 集成测试脚手架
│  └─ properties/                   # fast-check 性质测试
├─ supabase/
│  ├─ schema.sql                    # 新项目完整数据库结构与 RLS
│  └─ migrations/                   # 旧项目顺序增量迁移
├─ scripts/
│  ├─ clean.mjs                     # 可再生文件安全清理
│  ├─ capture-ui-screenshots.mjs    # 3 视口 × 10 路由截图（设计评审用）
│  ├─ diag-css-cascade.mjs          # 打印某元素实际胜出的 CSS 规则
│  ├─ verify-budget.mjs             # 产物各 chunk 的 gzip 体积预算
│  ├─ verify-csp.mjs                # 用生产响应头托管 dist/ 并断言零 CSP 违规
│  ├─ verify-module-boundaries.mjs  # 生产可达模块与 PENDING_MIGRATION 清单比对
│  ├─ verify-css-debt.mjs           # !important 棘轮，逐文件上限只降不升
│  ├─ verify-local.mjs              # 本地五档宽度 Chromium 门禁
│  ├─ verify-no-green.mjs           # 配色门禁（扫描 CSS 与 JS）
│  ├─ verify-study-plan-ui.mjs      # 学习计划页面门禁
│  ├─ verify-production.mjs         # 生产地址验证（含安全响应头与 CSP 违规）
│  ├─ deploy-*.ps1                  # 自动部署脚本
│  ├─ start-local.ps1               # Windows 本地启动实现
│  ├─ start-local.bat               # Windows 双击入口
│  └─ env.deploy.example            # 部署密钥模板，复制为根目录 .env.deploy
├─ docs/
│  ├─ STUDY_PLAN.md                 # 长期备考总控文档
│  ├─ PROJECT_AUDIT.md              # 当前架构边界与迁移顺序
│  ├─ TECH_STACK_REFRESH_2026-10-07.md
│  ├─ AUTO_DEPLOY.md                # 自动部署步骤
│  ├─ API_KEYS_CHECKLIST.md         # 密钥获取与填写清单
│  ├─ CHANGELOG.md                  # 版本变更记录
│  └─ history/                      # 时点审计，不是当前契约
├─ .github/workflows/quality.yml    # CI：npm ci 后执行 npm run quality
├─ eslint.config.js                 # ESLint 默认发现位置
├─ jsconfig.json                    # 编辑器与 tsc 默认发现位置
├─ package.json
├─ vercel.json                      # Vercel 默认发现位置
├─ vite.config.js                   # Vite 与 Vitest 配置
├─ LICENSE
├─ .editorconfig
├─ .env.example                     # 本地 Supabase 模板，复制为根目录 .env
└─ .gitattributes
```

## 运行链路

当前生产链路只有一条：

```text
index.html
  -> src/main.js
  -> src/app.js
     -> data / domain / infrastructure / ui
```

`src/app.js` 和 `src/infrastructure/supabase-sync.js` 是当前生产实现。`src/core/router.js`、`src/views/` 与 `src/infrastructure/sync-service.js` 属于已测试的渐进模块化层，但尚未由生产入口整体接管。不要同时启动两套状态或同步实现，否则会造成重复事件绑定和并发写入。

哪些模块在包内、哪些在包外，权威定义在 `scripts/verify-module-boundaries.mjs` 的 `PENDING_MIGRATION`；`npm run test:boundaries` 会从 `src/main.js` 重算可达性并双向比对，因此这份边界不会静默漂移。同一个目录里可以同时有生产文件和迁移文件，不要按目录名猜测一个文件是否已经上线。

## 模块边界

维护代码时遵循以下依赖方向：

```text
data ───────────────┐
utils -> domain ────┼─> app
core  -> infrastructure ┤
core  -> ui ─────────┘
```

- `domain/` 不读取 DOM、`localStorage` 或 Supabase，只接收参数并返回结果。
- `infrastructure/` 负责外部数据和持久化，不渲染页面。
- `ui/` 负责 DOM 交互，可以使用 `core/` 契约，但不直接实现业务规则。
- `data/` 只放静态事实、来源和展示元数据。
- `app.js` 只应承担装配和跨模块工作流；新增独立规则优先放入 `domain/`。
- 路由 ID 与移动端主入口统一定义在 `src/core/route-contract.js`，不要在视图或事件处理器中另建路由列表。
- 存储键统一定义在 `src/core/storage-contract.js`。
- 同步表与冲突键统一定义在 `src/infrastructure/sync-contract.js`。
- 样式加载顺序固定为 `base.css`、`workspace.css`、`styles/components/`、`styles/views/`。不要再在 `styles/` 根目录新增覆盖层。

当前主要技术债是 `src/app.js` 与 `src/styles/base.css` 体积较大。后续重构应按一个用户流程逐步迁移到 `views/`、`ui/` 和 `domain/`，每次迁移都必须保留测试并避免一次性重写。

## 路径与命名

- JavaScript、样式和脚本文件使用 kebab-case。模块导出使用动作或领域名，不使用 `utils2`、`new-*`、`legacy-*` 这类临时名。
- 一个状态键、同步表名或路由 ID 只有一个权威文件：`storage-contract.js`、`sync-contract.js`、`route-contract.js`。
- 生产云同步文件是 `infrastructure/supabase-sync.js`。`infrastructure/sync-service.js` 是尚未接管的替换实现，两者不要同时启动。
- 页面样式放在 `src/styles/views/`，跨页面控件放在 `src/styles/components/`。`base.css` 和 `workspace.css` 留在样式根目录，因为它们仍是全局层。
- 生产流程测试放在 `tests/integration/`。不挂载整页的测试留在 `tests/unit/`，性质测试留在 `tests/properties/`。
- `docs/` 只放仍在使用的说明。带日期的审计快照放在 `docs/history/`，变更记录放在 `docs/CHANGELOG.md`。阅读架构时以 `PROJECT_AUDIT.md` 和边界门禁为准。
- 根目录只保留工具会按约定自行读取的文件：`package.json`、`index.html`、`vite.config.js`、`eslint.config.js`、`jsconfig.json`、`vercel.json`、`README.md`、`LICENSE`，以及 `.gitignore`、`.gitattributes`、`.editorconfig`、`.env.example`。启动脚本、部署模板和变更记录不要再放回根目录。本机密钥仍然写在根目录的 `.env` 与 `.env.deploy`，这两个文件不提交。

## 路由与响应式契约

- 桌面端保留完整侧栏导航；宽度不超过 `900px` 时切换为固定的五项底栏：总览、今日、周计划、记录、更多。
- “更多”复用命令面板承载低频页面和操作；当前页面属于隐藏路由时，“更多”必须保持选中状态并提供可读的当前页面标签。
- 移动端由 `main` 承担垂直滚动，内容视口结束于固定底栏上方；不要改回整页滚动，否则会重新产生表单和按钮遮挡。
- 浏览器门禁固定检查 `320 / 390 / 768 / 1024 / 1440` 五种宽度，包括底栏标签、隐藏路由状态、弹层层级、横向溢出和桌面侧栏行为。

## 本地数据与环境变量

未登录时，`localStorage` 是本机同步读写的主存；启动时会与 IndexedDB 恢复镜像比较保存时间，恢复较新的完整状态。正常保存先写 `localStorage`，再异步更新 IndexedDB 副本，因此不支持 IndexedDB 的浏览器仍可使用本机模式。恢复镜像与网页同源，不能替代 JSON 导出或云端备份；显式清理本机数据时也会清除恢复副本。

登录使用 Supabase Auth 邮箱密码。忘记密码会发送回站恢复链接，并在 `PASSWORD_RECOVERY` 会话中设置新密码。Supabase Auth 的 Site URL 与 Redirect URLs 必须允许当前部署域名，否则邮件链接无法返回应用。

登录后页面先更新本机状态，再异步与 Supabase PostgreSQL 同步；离线或同步失败不会丢弃本机草稿。整库保存会串行执行，并在写表前复核当前用户，避免账号切换期间向新账号写入旧状态。分页查询使用稳定排序键，避免页间重复或漏读。

本地 Supabase 配置：

```powershell
Copy-Item .env.example .env
notepad .env
```

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

前端只能使用 publishable key。不要把 `service_role` key、数据库密码、JWT secret 或部署 token 写入源码、README 或可提交文件。

## 生成文件与清理

以下目录均可重新生成，不应提交：

```text
node_modules/
dist/
output/
coverage/
test-results/
playwright-report/
.playwright-cli/
.playwright-mcp/
.workbuddy/
.workbuddy-ai/
```

执行安全清理：

```powershell
npm run clean
```

清理脚本删除可再生的构建、覆盖率和浏览器产物：`dist/`、`output/`、`coverage/`、`test-results/`、`playwright-report/`、`.playwright-cli/`、`.playwright-mcp/`。它不会删除 `node_modules/`、`.env`、`.env.deploy`、`.vercel/`、`.vscode/` 或本地代理记忆目录。

## 质量门禁

提交前运行：

```powershell
npm run quality
git status
```

`quality` 必须依次通过以下步骤：

```text
ESLint static analysis
tsc --noEmit type check (jsconfig.json 覆盖 config/core/data/domain/infrastructure/utils)
Palette gate (src/**/*.{css,js} 不得重新引入已淘汰的绿色系)
Module boundary gate (src/main.js 的可达性必须与 PENDING_MIGRATION 清单一致)
CSS debt ratchet (!important 逐文件上限，只降不升)
Vitest 单元测试与性质测试
Chromium 门禁：全部路由与 320/390/768/1024/1440 五档宽度
Vite production build
Bundle budget：app / index.css / vendor-supabase / infra / domain / vendor-icons 的 gzip 体积上限
CSP 门禁：用 vercel.json 的真实响应头托管 dist/，遍历全部路由断言零 CSP 违规
npm audit --audit-level=moderate
```

当前产物体积以 `npm run build` 后的 `scripts/verify-budget.mjs` 为准。domain 包上限是 12 KB gzip。

## 数据库与部署

代码远程只有一个：`origin`，地址是 [https://github.com/2711944586/rw](https://github.com/2711944586/rw)。网页远程是 Vercel 项目 `rw`。数据远程是 Supabase：Auth、Postgres 和 RLS。两边都不要把密钥写进 Git。

| 位置 | 放什么 | 是否提交 |
| --- | --- | --- |
| `.env` | 浏览器使用的 `VITE_SUPABASE_URL` 与 publishable key | 否 |
| `.env.deploy` | GitHub、Supabase、Vercel 的部署令牌和数据库密码 | 否 |
| `.env.example` | 本地变量模板 | 是 |
| `scripts/env.deploy.example` | 部署变量模板 | 是 |

```powershell
Copy-Item .env.example .env
Copy-Item scripts/env.deploy.example .env.deploy
```

新 Supabase 项目执行 `supabase/schema.sql`。已经在跑的项目只按文件名顺序执行 `supabase/migrations/`，不要改写已经应用过的迁移。`016_sync_query_indexes_and_data_checks.sql` 为同步分页增加组合索引，并用 `NOT VALID` 检查约束保护后续写入。`schema.sql` 含同一组索引和约束，新项目不用再单独跑 016。

推送代码和发布网页是两步：

```powershell
git push -u origin main
npm run deploy:prod
```

`npm run deploy:all` 发布 Vercel Preview。`npm run deploy:prod` 发布生产，并按 `.env.deploy` 里的 `SUPABASE_SCHEMA_MODE` 更新数据库。当前模式写的是 `schema`，脚本会执行可重复的 `supabase/schema.sql`。生产域名还要写进 Supabase Auth 的 Site URL 和 Redirect URLs，否则找回密码邮件无法回到站点。

详细文档：

- [自动部署流程](docs/AUTO_DEPLOY.md)
- [API 密钥清单](docs/API_KEYS_CHECKLIST.md)
- [备考总控文档](docs/STUDY_PLAN.md)
- [当前架构边界](docs/PROJECT_AUDIT.md)
- [时点审计归档](docs/history/README.md)
- [前端参考、数据恢复与技术栈升级记录](docs/TECH_STACK_REFRESH_2026-10-07.md)

生产结构是 Vite 静态前端加 Supabase Auth、Postgres 和 RLS。Vercel 构建命令是 `npm run build`，输出目录是 `dist`。

## 学习系统边界

- 新计划起点固定为 `2026-08-31`；更早数据只归档，不进入新计划统计。
- 每日任务默认 3 项、最多 4 项；顺延或底线日允许降到 2 项。
- 数学一和 408 默认占核心时间 65%。
- 到期复盘每天最多压入 1 项必做，其余保留在复盘队列。
- 考点没有题量、正确率或交付证据时，不能直接标记为已掌握。
- 每科只保留一条主线资料，完成 70% 以上再考虑新增。
- 2027 年 9-10 月必须重新核验招生说明、专业目录、考试科目、招生人数、报名要求和初试日期。

更完整的阶段计划、复盘口径和官方基准见 [docs/STUDY_PLAN.md](docs/STUDY_PLAN.md)。
