# 收尾、验收与交接记录

记录日期：2026-09-15
对应审计：[TECH_AUDIT_2026-09-15.md](TECH_AUDIT_2026-09-15.md)（技术栈与门禁实测）、[PROJECT_AUDIT.md](../PROJECT_AUDIT.md)（架构边界与迁移顺序）
本轮范围：把 `TECH_AUDIT_2026-09-15.md` 提出的修复建议执行到「门禁回绿 + 可复核 + 可交接」的闭环。

---

## 0. 结论摘要

上一轮已经把大部分修复落进工作区（云 SDK 懒加载守门、vitest 升级、类型检查与覆盖率配套、`.editorconfig` / `.gitattributes`），但 `npm run quality` 仍然是红的，卡在第 2 步 `npm run typecheck` 的 11 项类型报错上；同时 75 个文件没有落盘、两份文档的数字仍滞后。

本轮做完这四件事后，`npm run quality` **退出码 0，全链路通过**：

1. 修掉 11 项类型报错（全部为标注/显式转换问题，无一处指向运行时缺陷）。
2. 消除 `sync-showcase` 的自证式属性测试，改为断言真实 `sync-service` 实现。
3. 补齐低风险工程化项：安全响应头、`LICENSE`、`CHANGELOG.md`、体积预算门禁、覆盖率不倒退阈值。
4. 校正 README / PROJECT_AUDIT 的滞后数字与结构，并把 75 个未落盘文件按语义分批提交、打上回退基线标签。

**当前门禁状态（本轮实测，非文档自述）**

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 静态检查 | `npm run check` | 通过，0 报错 |
| 类型检查 | `npm run typecheck` | 通过，0 报错（本轮修复前为 11 项） |
| 调色板 | `npm run test:palette` | `{"ok":true}` |
| 单元 + 属性测试 | `npm test` | 679 通过 / 679，39 个文件 |
| 浏览器门禁 | `npm run test:browser` | 通过，含 `"lazyCloudSdk": true` |
| 生产构建 | `npm run build` | 成功 |
| 体积预算 | `npm run test:budget` | 通过，6 项 chunk 全部在预算内 |
| 依赖审计 | `npm audit --audit-level=moderate` | `found 0 vulnerabilities` |
| **整链** | **`npm run quality`** | **退出码 0** |

---

## 1. 现状盘点清单

对应 `TECH_AUDIT_2026-09-15.md` 第 4 节的建议编号。状态口径：**可用**=已落地且有本轮实测证据；**部分**=主路径可用但存在已知残留；**未做**=尚未开始。

### 1.1 P0（让门禁回绿）

| # | 项 | 状态 | 位置 / 证据 | 可信度 |
| --- | --- | --- | --- | --- |
| P0-1 | 修 4 项契约测试漂移 | **部分** | `tests/unit/app-imports.test.js`（177,615 字节 / 62 用例）已与新版 `app.js` 对齐，`npm test` 全绿 | 断言仍是「源码字面量正则」而非行为断言，仍会随实现改写而失效。见 §2 与 §3 的 R-01 |
| P0-2 | 接上 `hasPersistedCloudSession()` | **可用** | `src/app.js:1274` 用 `hasPersistedCloudSession() \|\| hasCloudAuthRedirect()` 守门；`src/infrastructure/supabase-sync.js:57` 为守卫实现 | 浏览器门禁输出 `"lazyCloudSdk": true`，首屏不再无条件拉取 208.80 KB 的 SDK 分包 |
| P0-3 | 升级 vitest，消除中危 | **可用** | `node_modules/vitest/package.json` = 4.1.11、`@vitest/mocker` = 4.1.11 | `npm audit --audit-level=moderate` = 0 漏洞 |
| P0-4 | 提交未落盘文件 + 补 `.gitattributes` | **可用** | `.gitattributes`（`* text=auto eol=lf`）已存在；75 个文件已按语义分批提交，见 §10 | 提交前 `git status --porcelain` 为 75 条，提交后应为空 |
| P0-5 | 校正 README / PROJECT_AUDIT 滞后数字 | **可用** | `README.md`（命令表覆盖 19 个 script、结构块按真实列目录重写）、`docs/PROJECT_AUDIT.md:7,12,13,16` | 数字已按 `Get-ChildItem` + `Measure-Object` 实测值填写，见 §6 复核 |
| P0-6 | **修 11 项类型报错**（本轮新增阻断项） | **可用** | 5 个文件，见 §4.1 | `npm run typecheck` 退出码 0 |

### 1.2 P1（架构收敛，本季度）

| # | 项 | 状态 | 位置 / 证据 | 可信度 |
| --- | --- | --- | --- | --- |
| P1-6 | 按 `PROJECT_AUDIT.md` 顺序接管页面（设置 → 今日 → 记录 → 复盘 → 同步） | **未做** | `src/views/`（8 文件）、`src/core/router.js`、`src/infrastructure/sync-service.js` 仍是「可测试但不启动」 | 一行未进生产包；`src/app.js` 仍是唯一生产实现（7,132 行）。见 §3 的 R-02 |
| P1-7 | 给 `app.js` 补纯函数行为测试 | **部分** | `tests/unit/state-rules.test.js`（54 用例）覆盖 `migrateState` / `sanitize*` / `applyTombstones` / `mergeArrayById` / `filter*FromStart` | 未覆盖：`mergeStateByUpdatedAt`、`mergeSettingsByVersionedAssets`、`mergeWeekPlans`、`mergeTopicState`、`mergeObjectsByUpdatedAt`、`pruneTombstone`、`markDeleted` / `unmarkDeleted` |
| P1-8 | 路由级代码分割 | **未做** | 依赖 P1-6 | `views/*` 已实现 `mount/unmount`，接入后即可 `() => import()` |
| P1-9 | CSS 分层 + `@layer`，消解 65 处 `!important` | **未做** | `src/styles/base.css`（9,151 行）、`workspace.css`（5,978 行） | 必须逐段截图回归，不可一次性重写 |
| P1-10 | 删除 `sync-showcase` 自证式 helper | **可用** | `tests/properties/sync-showcase.prop.test.js` 已 `import` 真实 `resolveConflict` / `pushDirtyRecords` | 兼容断言已实证能区分真实实现与旧副本，见 §6.2 |

### 1.3 P2（工程化配套）

| # | 项 | 状态 | 位置 / 证据 |
| --- | --- | --- | --- |
| P2-a | 类型检查 | **可用** | `jsconfig.json` + `npm run typecheck`，已接入 `quality` 与 CI |
| P2-b | 覆盖率门禁 | **可用** | `@vitest/coverage-v8` 4.1.11 + `vitest.config.js` 阈值 49/45/49/50；刻意不进 `quality` 链 |
| P2-c | 格式化与提交钩子 | **部分** | `.editorconfig` 已加；**Prettier / husky / lint-staged / commitlint 未做** |
| P2-d | 迁移到 `@playwright/test` | **未做** | 仍在用自研 `scripts/verify-local.mjs` |
| P2-e | 接入 axe-core 无障碍扫描 | **未做** | 见 §9 未决问题 Q-04 |
| P2-f | 错误可观测性 | **未做** | 需要先定上报端点，见 §9 Q-05 |
| P2-g | `engines` + 版本管理 | **部分** | `package.json` 已加 `engines`；volta 未加，CI 仍是单 Node 22，未做 20/22 矩阵 |
| P2-h | 安全响应头 | **可用** | `vercel.json` 新增 `/(.*)` 全路径 CSP + 5 项头部；**仅静态校验，未线上验证**，见 §7 RISK-03 |
| P2-i | 性能预算 | **可用** | `scripts/verify-budget.mjs` + `npm run test:budget`，已接入 `quality` |
| P2-j | 仓库元文件 | **可用** | 新增 `LICENSE`（专有声明）、`CHANGELOG.md`（Keep a Changelog） |

### 1.4 P3（产品与体验）

`TECH_AUDIT_2026-09-15.md` 第 11–17 项（同步五态、任务→记录就地闭环、计划差异预览、PWA、趋势图收敛、考点证据链、提醒能力）**全部未做**，且均已在 `docs/PROJECT_AUDIT.md` 的 P1/P2 中登记。它们不属于「让门禁回绿」的范围，本轮不动。

---

## 2. 差距分析

已完成部分与「可交付、可复核、可交接」目标之间，仍有三类差距：

| 差距 | 具体是什么 | 为什么还缺 | 是否阻塞后续 |
| --- | --- | --- | --- |
| G-1 契约测试的强度 | `tests/unit/app-imports.test.js` 用 `readFileSync` + 正则断言 `app.js` 源码文本，共 62 个用例、177,615 字节。它这轮是「改测试去追实现」而不是「断言行为」 | 该文件是历史产物，一次性改写为行为断言是独立工作量；本轮优先让门禁回绿 | 不阻塞；但它降低了回归可信度，属须尽快处理项（R-01） |
| G-2 生产代码的测试强度 | 真正跑在用户浏览器里的 `src/app.js`（7,132 行）仍只有纯函数部分被覆盖；`main.js`、`ui/auth-panel.js`、`ui/workspace-controller.js` 无任何测试引用 | 行为测试需要 jsdom fixture 或视图层先接入生产；`app.js` 的 DOM 编排部分无法直接测 | 不阻塞；这是架构双轨（P1-6）的根因，见 R-02 |
| G-3 工程化配套的剩余项 | Prettier / husky / lint-staged / commitlint、`@playwright/test`、axe-core、错误上报、CI Node 矩阵均未做 | 前三项都会引入全仓重排或新工具链，属独立改造；错误上报缺端点 | 不阻塞；已逐条登记为待排期任务 |

**已在上一轮闭合、本轮仅确认无回归的项**：云 SDK 懒加载守门（P0-2）、vitest 中危（P0-3）、`.gitattributes` 换行噪声、`.editorconfig`、`engines` 字段、覆盖率工具链。

---

## 3. 剩余工作分解表

粒度按「第三方拿到本表即可排期，不必再问原作者」编写。完成定义（DoD）均为可观测结果。

| ID | 任务 | 优先级 | 依赖 | 预估 | 完成定义 |
| --- | --- | --- | --- | --- | --- |
| R-01 | 把 `tests/unit/app-imports.test.js` 的源码正则断言改写为行为断言（范式参照 `tests/unit/supabase-sync-auth.test.js` 的 mock SDK + 动态导入） | 高 | 无 | 0.5–1 天 | 该文件不再出现 `readFileSync`；`npm test` 全绿；故意改坏 `app.js` 中对应行为后测试会失败（需演示一次） |
| R-02 | 执行 `docs/PROJECT_AUDIT.md` 的接管顺序：设置页 → 今日 → 记录 → 复盘 → 最后换同步实现 | 高 | 无 | 2–4 周 | 每接管一页：该页由 `views/` 渲染，`app.js` 中对应 `bind*` / `render*` 与 `index.html` 静态骨架同时删除；五档宽度截图回归 + `npm run quality` 全绿 |
| R-03 | 补 `app.js` 剩余纯函数的性质测试（`mergeStateByUpdatedAt`、`mergeSettingsByVersionedAssets`、`mergeWeekPlans`、`mergeTopicState`、`mergeObjectsByUpdatedAt`、`pruneTombstone`、`markDeleted` / `unmarkDeleted`） | 中 | 无 | 0.5 天 | `tests/unit/state-rules.test.js` 覆盖上述导出；每个函数的合并/墓碑语义至少 1 条属性断言 |
| R-04 | 路由级代码分割：`views/*` 接入生产后改为动态 `import()` | 中 | R-02 | 随 R-02 计 | `app-*.js` chunk 的 gzip 体积显著下降，且 `npm run test:budget` 仍通过（必要时同步下调预算） |
| R-05 | CSS 分层：引入 `@layer tokens → base → layout → components → views → utilities`，逐段消解 65 处 `!important` 与 `workspace.css` 覆盖层 | 中 | 无 | 1–2 周 | 每移除一段都保留 `npm run test:browser` + 桌面/移动截图对比；`!important` 计数单调下降 |
| R-06 | 引入 Prettier + husky + lint-staged + commitlint | 低 | 无 | 0.5 天 | 首次全仓格式化单独成一个 commit；此后提交自动跑 lint-staged |
| R-07 | 迁移到 `@playwright/test`（保留现有断言逻辑，仅换壳，获得 trace / retry / HTML 报告 / 并行） | 低 | 无 | 1 天 | `npm run test:browser` 等价通过，且能产出 HTML 报告与失败 trace |
| R-08 | 接入 `@axe-core/playwright`，在浏览器门禁的每个路由跑一次无障碍扫描 | 低 | R-07 或独立 | 0.5 天 | 每个路由产出扫描结果；已知问题先以 allowlist 收敛再逐条修 |
| R-09 | 错误可观测性：全局 `window.onerror` / `unhandledrejection` 上报 | 低 | 需先定端点（§9 Q-05） | 0.5–1 天 | 线上异常可在某处查询；上报失败不得影响主流程 |
| R-10 | CI 加 Node 20 / 22 矩阵 | 低 | 无 | 0.2 天 | `.github/workflows/quality.yml` 两个 Node 版本都跑 `npm run quality` |
| R-11 | 校正 `docs/TECH_AUDIT_2026-09-15.md` 自身的基线数字（6,984 行 / 623 测试 / 38 文件）或改为指向本文件 | 低 | 无 | 0.2 天 | 该文档数字与本文件 §6 一致，或明确标注为「审计时点基线」 |

---

## 4. 本轮变更与决策记录

### 4.1 代码变更（5 个文件，仅类型标注与显式转换）

| 文件 | 变更 | 理由 |
| --- | --- | --- |
| `src/data/study-plan-governance.js:86` | `stageControlRules` 加 `Array<[RegExp, string, string, string]>` 标注 | 元组数组被推断为 `(string\|RegExp)[]`，`pattern.test(name)` 落在联合类型上；运行时第 0 项恒为 RegExp |
| `src/domain/review-queue.js:81` | `(a - b)` → `(a.getTime() - b.getTime())` | `Date` 隐式转 number，行为等价、类型合法 |
| `src/domain/study-strategy.js:382` | 同上 | 同上 |
| `src/domain/task-contract.js:106,164` | `validateMasteryPromotion` / `checkMasteryDemotion` 的 JSDoc 字段改可选 | 实现本就容忍 `{}` 入参（`= {}` 默认值 + `if (!last_review)`），是标注比实现更严 |
| `src/infrastructure/sync-service.js:149` | `pullRemoteState` 的 `@returns` 补 `failed?: string[]` | 该函数 3 处 `return` 与事件都真实带 `failed` |

**决策**：全部采用真实修正，禁用 `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` / `eslint-disable`，且不放宽 `jsconfig.json`。

### 4.2 测试变更（1 个文件）

`tests/properties/sync-showcase.prop.test.js`：删除内联的 `resolveConflict` / `syncWithErrorPreservesDirty` 副本，改为 `import` 真实 `src/infrastructure/sync-service.js`。

- Property 26（冲突解决）2 → 4 项：断言同一对象引用（`toBe`）而非副本比较，字段 `archived` → `loser`，新增「平局 remote 胜」「`updated_at` 不可解析时 remote 胜」。
- Property 27（失败保留 dirty）项数不变、含义重写：直接调 `pushDirtyRecords`，并用 `vi.spyOn(OfflineCache, 'clearDirty')` 断言失败路径从不清理 dirty 标记。
- 净变化：677 → 679 用例。

### 4.3 工程化补齐（7 个文件）

| 文件 | 变更 |
| --- | --- |
| `vercel.json` | 保留原有 `Cache-Control`；新增 `/(.*)` 的 CSP + `X-Content-Type-Options` + `Referrer-Policy` + `X-Frame-Options` + HSTS + `Permissions-Policy` |
| `LICENSE`（新） | 专有声明（中英双语）。**决策**：项目 `private: true`，不套用 MIT |
| `CHANGELOG.md`（新） | Keep a Changelog 风格，首条 `v4.1.0`，与 `package.json` 版本号一致 |
| `scripts/verify-budget.mjs`（新） | 按 chunk 前缀聚合 **gzip** 体积并断言上限；未匹配到文件（分包改名）与 `dist` 缺失都判失败，避免门禁静默失效 |
| `package.json` | 加 `test:budget`，插入 `quality` 链的 `build` 之后、`npm audit` 之前 |
| `vitest.config.js` | 加 `coverage.provider: 'v8'` 与不倒退阈值 49/45/49/50 |
| `.gitignore` | 追加 `.workbuddy/`（工具元数据）与 `coverage/`（生成的 HTML 报告） |

**决策（记录一处超出原始清单的改动）**：`coverage/` 是执行方在实现过程中的自主追加，原清单只要求 `.workbuddy/`。影响：`npm run clean` 不清理 `coverage/`，所以把它列入忽略清单只是阻止误提交，不改变清理行为。已接受。

### 4.4 文档校正（2 个文件 + 1 个新增）

| 文件 | 变更 |
| --- | --- |
| `README.md` | 常用命令表重写为覆盖 `package.json` 全部 19 个 script；项目结构块按真实列目录重写；质量门禁小节改为 8 步完整链路 + 实测 gzip 数字；生成目录清单补 `coverage/`、`.workbuddy/` |
| `docs/PROJECT_AUDIT.md` | 文首加 2026-09-15 备注指向本文件与 `TECH_AUDIT_2026-09-15.md`；39 → **43** 模块；6,444 → **7,132** 行；36 文件 / 609 项 → **39 文件 / 679 项** |
| `docs/REMEDIATION_2026-09-15.md`（新增，本文件） | 盘点、差距、分解、变更、验收、复核、风险、交接、未决问题 |

### 4.5 明确放弃（本轮不做，均列入 §3 或 §9）

| 项 | 理由 |
| --- | --- |
| 整页迁移到 `views/`（R-02） | 需要逐页截图回归，属多轮工作；本轮目标是回绿，不是架构改造 |
| Prettier 全仓格式化 | 会产生一次不可审查的巨型 diff，应单独成 commit |
| `@playwright/test` 迁移、axe-core | 工具链替换属独立工作项，不影响本轮门禁可信度 |
| 给 Property 27 补三条网络失败路径（未配置 / 未认证 / upsert 报错） | 需要 mock client 或改 `sync-service.js` 实现，超出「不改实现」的边界；已在测试文件内标注待办 |
| 改写 `app-imports.test.js` 为行为断言（R-01） | 独立工作量，且当前断言已与实现对齐、测试全绿 |

---

## 5. 验收核对表

完成标准 → 证据位置 / 复核命令。

| 完成标准 | 证据位置 / 复核命令 | 结论 |
| --- | --- | --- |
| 已完成部分被逐项盘点并标注可信度 | 本文件 §1（P0/P1/P2/P3 四张表，每行含位置与证据） | 满足 |
| 剩余范围与目标差距已明确 | 本文件 §2（G-1/G-2/G-3，含「是否阻塞后续」） | 满足 |
| 剩余工作被拆成可执行、可验收任务 | 本文件 §3（R-01…R-11，含优先级/依赖/预估/DoD） | 满足 |
| 新增成果与已有部分风格结构一致 | `README.md`、`docs/PROJECT_AUDIT.md`、`CHANGELOG.md` 沿用既有中文语气与 `UPPER_SNAKE` 命名；`scripts/verify-budget.mjs` 与同目录 `verify-*.mjs` 同构（读 `dist/products` → 打印 → 非 0 退出） | 满足 |
| 原有已完成部分未被破坏 | `npm run quality` 退出码 0；`npm test` 679/679（较基线 677 只增不减）；浏览器门禁仍含 `lazyCloudSdk: true` | 满足 |
| 整体成果可直接使用 | `npm run quality` 全绿；README 命令表 19 条与 `package.json` 一一对应；代码块无「待补充」占位 | 满足 |
| 异常与边界情况有处理方式 | 本文件 §7（RISK-01…RISK-05 触发信号与应对）；`verify-budget.mjs` 的「dist 缺失」「预算未匹配」两条失败分支已实测 | 满足 |
| 验证过程可被别人独立复现 | 本文件 §6（`npm run quality` 8 步命令 + 预期输出 + 实测 gzip 数字） | 满足 |
| 交付与交接说明完整 | 本文件 §8（环境、命令、发布、排查、后续） | 满足 |
| 风险项与回滚方式已写明 | 本文件 §7（含基线标签与 `git reset` 回滚步骤） | 满足 |
| 未决问题集中登记 | 本文件 §9（Q-01…Q-08，含影响范围与建议选项） | 满足 |

---

## 6. 复核记录

### 6.1 独立复现步骤（第三方可照做）

```powershell
cd D:\DATA\rw
npm run quality          # 期望：退出码 0，8 步全绿
```

逐项命令与预期：

| 步骤 | 命令 | 预期 |
| --- | --- | --- |
| 1 | `npm run check` | 无输出，退出码 0 |
| 2 | `npm run typecheck` | 无输出，退出码 0（修复前为 11 项报错） |
| 3 | `npm run test:palette` | `{"ok":true,...}` |
| 4 | `npm test` | `Test Files 39 passed (39)` / `Tests 679 passed (679)` |
| 5 | `npm run test:browser` | 退出码 0，输出含 `"lazyCloudSdk": true`、`"ok": true` |
| 6 | `npm run build` | `✓ built in …` |
| 7 | `npm run test:budget` | 6 行 `ok`，`Bundle budget check passed.` |
| 8 | `npm audit --audit-level=moderate` | `found 0 vulnerabilities` |

补充检查：

```powershell
git status --porcelain            # 期望：无输出（工作区已落盘）
git tag --list "*2026-09-15"      # 期望：列出基线与完成标签
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'));console.log('ok')"
```

### 6.2 门禁自身的有效性（反向验证）

只跑通门禁不够，还要确认门禁**会失败**：

| 验证 | 做法 | 实测结果 |
| --- | --- | --- |
| 体积预算会拦 | 临时把预算调低到当前值之下 | `FAIL app … (+13.55 KB)`，退出码 1 |
| 预算未匹配会拦 | 用不存在的 chunk 前缀 | `ghost-chunk: no matching chunk found`，退出码 1 |
| `dist` 缺失会拦 | 删除 `dist/` 后运行 | 打印需先 `npm run build`，退出码 1 |
| 覆盖率阈值会拦 | `--coverage.thresholds.statements=99` 强制 | `ERROR: Coverage for statements (49.83%) does not meet global threshold (99%)`，退出码 1 |
| 新属性断言有区分度 | 临时测试文件同时跑真实 `resolveConflict` 与被删副本 | 真实实现通过；副本在 `winner === remote` 上抛 `AssertionError`，证明断言绑定的是线上实现 |

### 6.3 关键数字复核（AutoCoder 独立重测，非引用执行方自述）

| 指标 | 实测值 | 取数命令 |
| --- | --- | --- |
| `src` JS 模块数 / 行数 | 43 / 18,032 | `Get-ChildItem src -Recurse -File -Include *.js,*.mjs`（排除 `*.test.js`）+ `Measure-Object -Sum` |
| `src/app.js` 行数 | 7,132 | `(Get-Content src\app.js).Count` |
| 测试文件数 / 行数 / 用例数 | 39 / 13,241 / 679 | `Get-ChildItem tests -Recurse -File -Include *.test.js` + `vitest --run` |
| 覆盖率（All files） | statements 49.83 / branches 46.38 / functions 49.81 / lines 51.26 | `vitest --run --coverage` |
| chunk gzip（实测 / 预算 KB） | app 113.55/125、index.css 86.55/95、vendor-supabase 54.70/60、infra 9.63/12、domain 7.14/9、vendor-icons 2.46/4 | `npm run test:budget` |

### 6.4 复核中发现的问题与处理

| # | 发现 | 处理 |
| --- | --- | --- |
| D-1 | `README.md` 常用命令表里 `npm run clean` 一行写作「删除构建、覆盖率、截图、测试报告等」，但 `scripts/clean.mjs` 实际只删 `dist`、`output`、`test-results`、`playwright-report`、`.playwright-cli`、`.playwright-mcp`，**不含 `coverage/`** | 已在提交前修正该行措辞，与同文档「生成文件与清理」小节保持一致 |
| D-2 | `checkMasteryDemotion({})` 在 `topic.mastery_status` 缺失时返回 `{ shouldDemote: false, newStatus: undefined }`，但 `@returns` 写的是 `newStatus: string`。因 `strictNullChecks: false`，`tsc` 不报 | 不改代码（该函数目前只在测试被引用）；登记为 Q-02 |
| D-3 | `OfflineCache.setDirty()` 在 Node 测试环境下返回 `false`（无 `localStorage`，尽管内存脏队列已更新） | 新用例改为断言 `getDirtyRecords()` 内容而非返回值；登记为 Q-06 |
| D-4 | `docs/TECH_AUDIT_2026-09-15.md` 自身引用的基线数字（6,984 行 / 623 测试 / 38 文件）是审计时点的旧值，与本轮校正后的数字不同 | 按「不改审计原文」的边界保留；登记为 Q-01 |
| D-5 | 11 项类型报错**无一处指向真实运行时缺陷**：1 处元组推断、4 处 `Date` 隐式转换、3 处标注过严、3 处 `@returns` 漏声明 | 已按真实修正处理；结论记录于此，避免后来者误以为修掉了 11 个 bug |

---

## 7. 风险与回滚

### 7.1 风险登记

| ID | 风险 | 触发信号 | 应对动作 |
| --- | --- | --- | --- |
| RISK-01 | **范围蔓延**：把架构迁移（R-02/R-05）塞进本次收尾，导致门禁再次变红 | `npm run quality` 出现新失败；diff 触及 `src/views/` 生产接线 | 立即停止迁移，用 §7.2 回退到基线；迁移另开分支 |
| RISK-02 | **依赖断裂**：`package-lock.json` 与 `node_modules` 不一致（本轮升级过 vitest/vite） | `npm ci` 失败或 `npm test` 报模块缺失 | `npm ci` 重建；必要时按 `package-lock.json` 回退到 `vitest@4.1.7` |
| RISK-03 | **成果冲突**：新增的 CSP 在生产挡住合法请求（字体、Supabase 连接、`data:` 图标） | 生产页面白屏、字体缺失、登录失败、控制台出现 CSP 违规 | 先临时删除 `Content-Security-Policy` 那一项（其余 5 个头无副作用），按控制台报的指令逐条放行，再回填 |
| RISK-04 | **信息缺失**：`app-imports.test.js` 的源码正则断言在下一次改 `app.js` 时再次集体失效 | `npm test` 突然出现一批 `app-imports` 失败 | 不要改回实现去迁就断言；按 R-01 改写为行为断言 |
| RISK-05 | **门禁失效静默**：分包改名后体积预算匹配不到文件而「假通过」 | `verify-budget.mjs` 输出 `no matching chunk found` | 该分支已实现为失败；若出现，同步更新 `BUDGETS` 的 `key` |

### 7.2 回滚到已完成基线

本轮提交前的工作区状态已打标签。回退步骤：

```powershell
cd D:\DATA\rw
git tag --list "baseline-*"                  # 确认基线标签名
git reset --hard <baseline-tag>              # 丢弃本轮全部提交，回到提交前的已完成基线
git status --porcelain                       # 期望：无输出
npm ci                                       # 重建与基线一致的依赖
npm run quality                              # 期望：退出码 0
```

如果只想撤销某一项改动，用 `git checkout <baseline-tag> -- <path>` 单文件回退，不必整体回滚。提交前的工作区本身包含上一轮成果，所以基线标签**不等于** `HEAD` 之前的历史版本，而是「上一轮成果已落盘、本轮修复尚未开始」的状态。

**数据安全**：本轮全部改动都在代码、文档与配置层，不涉及 `supabase/` 数据、`.env*` 密钥或线上数据，回滚不会丢用户数据。

---

## 8. 交接说明

### 8.1 环境前置

- Node.js `^20.19.0 || >=22.12.0`（本机实测 22.22.0）。`package.json` 的 `engines` 已固化该要求。
- 首次使用：`npm install`，再 `npm run start:local`（或双击 `start-local.bat`）。
- 本地 Supabase 配置从 `.env.example` 复制到 `.env`，只填 publishable key。**不要**把 `service_role` key 写进任何可提交文件。

### 8.2 日常命令

提交前跑 `npm run quality`（8 步整链，见 §6.1）。单点排查用对应子命令：`npm run check` / `typecheck` / `test` / `test:props` / `test:browser` / `test:palette` / `test:study-plan-ui` / `test:budget` / `test:coverage`。

> 注意：`npm run test:budget` 依赖 `dist/`，必须先 `npm run build`；`npm run quality` 已按正确顺序串联，无需手动处理。

### 8.3 发布

`npm run deploy:all`（Preview）/ `npm run deploy:prod`（Production），细节见 `docs/AUTO_DEPLOY.md`。发布后建议跑 `npm run verify:production <URL>` 验证生产地址；**尤其要在本轮首次发布后确认 CSP 未误伤**（RISK-03）。

### 8.4 常见故障排查

| 症状 | 先查什么 |
| --- | --- |
| `npm run quality` 在第 2 步失败 | 类型报错，看 `tsc` 输出；本次修复的四类问题见 §4.1 |
| 第 5 步浏览器门禁失败 | 先看输出里的 `"lazyCloudSdk"` 是否为 `true`；不是则检查 `initCloudSession` 的守门逻辑（`src/app.js:1274`） |
| 第 7 步体积预算失败 | 看哪个 chunk 超限；若是有意新增功能，同步调整 `scripts/verify-budget.mjs` 的 `BUDGETS` 并在 `CHANGELOG.md` 记录 |
| 线上页面白屏 / 资源被拒 | CSP，按 RISK-03 处理 |
| 修改后 `app-imports` 测试集体失败 | 这正是 R-01 要解决的问题；短期按新实现同步断言，长期改写为行为断言 |
| Git 反复提示 CRLF | `.gitattributes` 已设 `* text=auto eol=lf`；若仍出现，执行 `git add --renormalize .` 后单独提交 |

### 8.5 接手后优先做什么

1. **R-01**（契约测试改行为断言，0.5–1 天）——性价比最高，直接提升回归可信度。
2. **R-03**（补齐 `app.js` 纯函数测试，0.5 天）——`mergeStateByUpdatedAt` 等合并函数是云同步的正确性核心。
3. **R-02**（架构接管，2–4 周）——按 `docs/PROJECT_AUDIT.md` 的顺序，一页一页来，接管即删旧。
4. 其余 R-06…R-11 按排期插入。

---

## 9. 未决问题登记

| ID | 问题 | 影响范围 | 建议选项 |
| --- | --- | --- | --- |
| Q-01 | `docs/TECH_AUDIT_2026-09-15.md` 内的基线数字（6,984 行 / 623 测试 / 38 文件）是审计时点值，与本轮校正后的值（7,132 / 679 / 39）不同 | 只影响文档阅读者，不影响代码 | A. 在原文档加「审计时点基线」标注；B. 改为引用本文件 §6.3。推荐 A（保留审计的历史真实性） |
| Q-02 | `checkMasteryDemotion` 在 `mastery_status` 缺失时返回 `newStatus: undefined`，与 `@returns` 的 `string` 不符；`strictNullChecks: false` 掩盖了它 | 迁移层函数，目前只有测试引用 | A. 补默认值 `'needs_review'`；B. 标注为 `string \| undefined`。推荐 B（不改变行为）；若将来接入生产再按 A 修正 |
| Q-03 | 新增的 CSP 无法在本地验证，只能静态校验 | 生产可用性 | 首次部署后立即跑 `npm run verify:production <URL>` 并检查控制台 CSP 违规 |
| Q-04 | 是否引入 `@axe-core/playwright` | 无障碍自动化 | A. 引入并在门禁中跑（推荐）；B. 暂不引入，继续人工检查 |
| Q-05 | 错误上报的端点是自建还是接 Sentry | 线上可观测性 | 需用户决定；自建端点零成本但要自己维护，Sentry 开箱可用但引入第三方依赖 |
| Q-06 | `OfflineCache.setDirty()` 的返回值语义是「缓存与队列是否都持久化成功」，但在无 `localStorage` 环境恒为 `false` | 测试写法与调用方判断 | A. 保持现状、测试断言 `getDirtyRecords()`；B. 拆分返回值。推荐 A |
| Q-07 | `LICENSE` 署名用了 `Constantine`（取自本机主机名） | 法律声明的准确性 | 需用户确认署名与年份是否正确，必要时修正 |
| Q-08 | CI 是否加 Node 20 / 22 矩阵（当前只跑 Node 22） | 兼容性覆盖 | A. 加矩阵（推荐，成本低）；B. 保持单版本 |

---

## 10. 本轮提交记录

75 个未落盘改动按语义拆成 5 个提交（C1–C5）落盘，第 6 个提交用于回填本节。

| 组 | 提交 subject |
| --- | --- |
| C1 | `chore(structure): 迁移根目录实现到 src 分层并清理旧副本` |
| C2 | `test: 补齐单元/属性测试并消除自证式属性测试` |
| C3 | `build(quality): 接入类型检查、覆盖率、体积预算与安全响应头` |
| C4 | `chore(config): 更新本地环境变量样例` |
| C5 | `docs: 新增审计与交接文档并校正滞后数字` |

回退基线标签：`baseline-pre-remediation-2026-09-15` → `370734d`，即「上一轮成果已落盘、本轮修复尚未开始」的仓库状态（回退步骤见 §7.2）。
完成标签：`remediation-2026-09-15`。

`git log --oneline` 实际输出（下方列出 C1–C5 与提交前基线；本节回填本身是第 6 个提交）：

```text
5723e62 docs: 新增审计与交接文档并校正滞后数字
7f5d789 chore(config): 更新本地环境变量样例
aae17b7 build(quality): 接入类型检查、覆盖率、体积预算与安全响应头
2a53872 test: 补齐单元/属性测试并消除自证式属性测试
647b8b1 chore(structure): 迁移根目录实现到 src 分层并清理旧副本
370734d Upgrade study system for June 15 start
```

