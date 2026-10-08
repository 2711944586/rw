# 技术栈与成熟度审计

审计日期：2026-09-15 · 审计范围：仓库全量（`src` / `tests` / `scripts` / `supabase` / `docs` / 构建与部署配置）
审计方式：静态遍历 + 实际执行门禁命令（不依赖文档自述）

---

## 0. 结论摘要

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 技术选型 | A- | 无框架原生 DOM + Vite + Supabase，依赖极简（4 个运行时依赖），选型与其单用户本地优先的定位高度匹配 |
| 工程质量 | B+ | 623 项测试、ESLint 零报错、五档宽度浏览器门禁、输入清洗体系完备；但测试与生产代码存在结构性错位 |
| 架构健康度 | C+ | `app.js` 6984 行单文件承担编排+渲染+状态；另有 5944 行"已测试但未接入"的平行实现，长期双轨 |
| 门禁可信度 | **D** | **当前 `npm run quality` 是全红的**：4 项测试失败 + 浏览器门禁失败 + `npm audit` 有中危项 |
| 工程化配套 | C | 缺类型检查、格式化、覆盖率、提交钩子、E2E 框架、错误上报、a11y 自动化、性能预算 |
| 文档 | A | README + 4 份 docs 质量高于同类项目，但数字已滞后于代码 |

**一句话**：这是一个**产品设计与输入安全做得相当扎实、但质量门禁此刻处于红灯、且架构上留了一条未闭合的双轨迁移**的个人项目。修复顺序应该是「先让门禁回绿 → 再闭合迁移」，而不是继续加功能。

---

## 1. 项目定位与真实运行链路

面向北大软微考研备考的本地优先学习执行系统。核心闭环：阶段计划 → 每日任务 → 记录 → 间隔复盘（D+1/3/7/14/30）→ 考点证据 → 模考校准 → 可选云同步。

实际生产链路（用导入图可达性实测，非文档自述）：

```
index.html (1116 行，承载全部 10 个视图骨架)
  └─> src/main.js (76 行，容错壳 + 动态 import)
        └─> src/app.js (6984 行，唯一生产实现)
              ├─ config/  data/  domain/(部分)  utils/
              ├─ infrastructure/supabase-sync.js  browser-storage.js  sync-contract.js
              └─ ui/ icon-registry  workspace-controller  view-render-coordinator
                  auth-panel  density-controller  study-plan-templates
```

从 `main.js` 出发可达 **24 个模块**；有 **19 个模块、5944 行代码不可达**（见 3.4）。

---

## 2. 技术栈清单

### 2.1 构建与运行时

| 项目 | 版本 | 备注 |
| --- | --- | --- |
| Node.js | 22.22.2（实机） | `package.json` **无 `engines` 字段**，README 口述的 ^20.19 / >=22.12 无机器约束 |
| Vite | 7.3.6 | 静态构建，`manualChunks` 手工分包 |
| 模块格式 | ESM (`"type": "module"`) | 无 CommonJS |
| 语言 | **JavaScript + 零散 JSDoc**，无 TypeScript | 无 `tsconfig.json` / `jsconfig.json`，无类型检查 |

### 2.2 前端

| 项目 | 说明 |
| --- | --- |
| UI 方案 | **零框架**：原生 DOM API 直接操纵。实测 `app.js` 中 `getElementById` 212 次（150 个唯一 ID）、`querySelector(All)` 46 次、`addEventListener` 76 次、`innerHTML =` 77 次、`render*` 函数 70 个、`bind*` 函数 13 个 |
| 样式 | 手写 CSS，无 Tailwind / 无预处理器。三层加载：`base.css`(9152 行/1337 规则块) → `workspace.css`(5974 行/975 块) → `study-plan.css` + `components/{toolbar,auth}.css`。合计 65 处 `!important`、83 个自定义属性 |
| 图标 | `lucide` 1.16.0，`data-lucide` 属性 + `hydrateIcons()` 水合 |
| 字体 | `@fontsource-variable/geist` + `@fontsource-variable/noto-sans-sc` 5.3.0，可变字重，本地打包（构建产出 103 个 woff2 切片，约 5.5 MB） |
| 主题 | 黑白灰基底 + 钴蓝强调色；三档信息密度（专注/平衡/详尽），用 `data-density` 属性驱动 |
| 响应式 | 断点 900px 切换移动底栏（4 高频 + "更多"复用命令面板）；已使用 `env(safe-area-inset-*)`（base.css 7 处、workspace.css 4 处） |

### 2.3 后端与数据

| 项目 | 说明 |
| --- | --- |
| BaaS | Supabase（Auth + Postgres + RLS） |
| SDK | `@supabase/supabase-js` 声明 `^2.84.0`，实装 **2.106.2**（minor 漂移） |
| 数据模型 | `supabase/schema.sql` 315 行，**12 张表**，**12 张表全部启用 RLS**，12 条 `owner` 策略（`user_id = auth.uid()`），无 service_role 泄露 |
| 迁移 | `supabase/migrations/` 15 个顺序增量脚本（001–015） |
| 本地持久化 | `localStorage`，键名收敛在 `core/storage-contract.js`（10 个键，含 4 个 legacy） |
| 同步策略 | 表名/冲突键收敛在 `infrastructure/sync-contract.js`（9 张同步表）；本机先写、云端异步；离线缓存与 tombstone 删除标记已实现 |
| 懒加载 | SDK 通过 `import("@supabase/supabase-js")` 动态导入，独立分包 208.8 KB（gzip 54.7 KB）——**设计正确，但当前接线有缺陷，见 3.3** |

### 2.4 测试与质量

| 项目 | 说明 |
| --- | --- |
| 单测/属性测试 | Vitest 4.1.7 + jsdom 29 + fast-check 4.8 / @fast-check/vitest 0.4 |
| 规模 | **38 个测试文件 / 12,624 行 / 623 个用例**（109 个 describe） |
| 浏览器门禁 | Playwright 1.60，**自研 .mjs 脚本**（非 `@playwright/test`）：起 Vite dev server → Chromium → 遍历 10 个路由 + 5 档宽度（320/390/768/1024/1440）+ 移动底栏遮挡/弹层层级/横向溢出 |
| 静态检查 | ESLint 10.8.1 flat config（`no-unused-vars` error 级，含 `reportUnusedDisableDirectives`） |
| 专项门禁 | `verify-no-green.mjs`（调色板禁用饱和绿/青）、`verify-study-plan-ui.mjs`、`verify-production.mjs` |
| CI | GitHub Actions `quality.yml`（Node 22 + chromium + `npm run quality`） |
| **缺口** | 无 `@vitest/coverage-*`、无 `.editorconfig`、无 Prettier、无 husky/lint-staged、无 `@playwright/test`、无 axe-core/pa11y、无 Lighthouse |

### 2.5 部署

| 项目 | 说明 |
| --- | --- |
| 目标 | Vercel 静态托管（`framework: vite`，build `npm run build`，output `dist`） |
| 脚本 | `scripts/deploy-all.ps1` + `deploy-lib.ps1`（Preview / Production 双模式） |
| 安全头 | `vercel.json` **只有 `Cache-Control`**，缺 CSP、`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、HSTS |
| 秘钥管理 | `.env` / `.env.deploy` 均已被 `.gitignore` 覆盖，仓库内无明文泄漏（此项通过） |

---

## 3. 完善程度评估（实测）

### 3.1 门禁实测结果

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 静态检查 | `eslint .` | ✅ **0 报错** |
| 单元 + 属性测试 | `vitest --run` | ❌ **4 失败 / 619 通过（共 623）** |
| 浏览器冒烟 | `scripts/verify-local.mjs` | ❌ **失败**：`Supabase SDK loaded without a persisted session` |
| 调色板 | `scripts/verify-no-green.mjs` | ✅ 通过 |
| 生产构建 | `vite build` | ✅ 成功，9.05s |
| 依赖审计 | `npm audit` | ❌ **2 个 moderate**（`vitest`、`@vitest/mocker`，均有修复版本） |
| 结论 | `npm run quality` | ❌ **整套门禁为红**（`&&` 链会在第 2 步中断） |

### 3.2 做得好的地方

- **输入清洗体系**是真正的亮点：`app.js` 内有 40+ 个 `sanitize*` / `first*Value` 归一化函数，`escapeHtml`/`escapeAttr` 调用 202 处，另有 `safeExternalUrl`、`UNSAFE_PATH_KEYS`（`__proto__`/`constructor`/`prototype`）防护，导入 JSON 有体积上限与结构校验。这在个人项目里属于超配。
- **契约集中化**：路由 ID（`route-contract.js`）、存储键（`storage-contract.js`）、同步表与冲突键（`sync-contract.js`）各有唯一权威定义，测试与生产共用同一份。
- **测试形态先进**：fast-check 属性测试覆盖 9 个 domain 模块（calibration / plan-generator / review-queue / retrospective / source-registry / task-contract 等），不是凑数的 `expect(1).toBe(1)`。
- **决策留痕**：`docs/PROJECT_AUDIT.md` 明确记录"哪些是已测试但不启动的迁移层、为什么不能删"，避免了后来者误删。这种自我约束在个人项目里罕见。
- **移动端契约明确**：底栏 4+更多、隐藏路由的选中态与可访问标签、`main` 独立滚动视口、`scroll-margin-bottom` 均已落地并有门禁断言。
- **数据安全**：删除/导入/清缓存前自动快照、导出前脱敏、`downloadStateBackup` 独立于云同步。

### 3.3 红灯项与根因

#### ① 4 项源码契约测试与 `app.js` 漂移（`tests/unit/app-imports.test.js`）

该文件用 `readFileSync` 读源码 + 正则匹配函数体，属于"源码字面契约"测试。工作区的未提交改动让断言全部失效：

| 断言期望 | `app.js` 现状 |
| --- | --- |
| `signOutAction()` 内 `try { setAuthBusy(true); ...` | 已插入 `authRequestInFlight = true;`（防并发合并） |
| `manualSyncNow()` 内 `setAuthResult("pending","正在同步","正在检查本机与云端状态。"); const result = await syncNow();` | 已改为**先 `pullCloudState()` 再 `syncNow()`**，含 5 种 reason 分支 |
| `openAuthDialog` 的调用与形参签名 | 调用点已变更 |
| `stopCloudAuthListener = onAuthChange(handleCloudAuthListener)` | 已改为内联箭头函数 + `authRequestInFlight` 守卫 |

**根因**：断言绑定实现细节而非行为。修改本身是**功能改进**（拉取优先、并发防抖），测试却把"写法"当成契约。

#### ② 云 SDK 懒加载契约被自己破坏（浏览器门禁失败）

```
Error: Supabase SDK loaded without a persisted session:
  [".../@supabase_supabase-js.js?v=9038cd34"]
```

**根因链**：`app.js:1239` 在 `initCloudSession()` 中**无条件**先调用 `bindCloudAuthListener()`（注释说明是为了兼容邮箱确认回跳），而 `onAuthChange()` → `getSupabaseClient()` → 触发 `import("@supabase/supabase-js")`；紧随其后的 `getCurrentSession()`（`app.js:1241`）同样无条件需要客户端。

**讽刺点**：`infrastructure/supabase-sync.js:57` **已经实现了 `hasPersistedCloudSession(storage)`**，专门用于判断"是否存在 `sb-<ref>-auth-token`"，且该函数有单测覆盖——但**生产代码从未调用它**。这既破坏了首屏零云端开销的设计目标（实测 208.8 KB / gzip 54.7 KB 被无谓加载），也让门禁变红。

**修复方向**（约 10 行）：

```js
const hasAuthRedirect = /access_token|type=(signup|recovery|invite)|error_description/.test(location.hash + location.search);
if (hasPersistedCloudSession() || hasAuthRedirect) bindCloudAuthListener();
if (hasPersistedCloudSession() || hasAuthRedirect) { /* 才走 getCurrentSession */ }
```

#### ③ 依赖审计有中危项

`@vitest/mocker` 路径穿越（CWE-22，CVSS 5.9），影响范围 `>=2.1.0 <4.1.11`，当前 `vitest@4.1.7` 落入区间。`fixAvailable: true`。虽属 devDependency、不进生产包，但 `npm run quality` 里的 `--audit-level=moderate` 会因此中断。

#### ④ 工作区严重脏：60 个文件未提交，`+2506 / -14092`

本轮做过一次大规模目录重组（根目录 `src/density.js`、`src/referenceData.js`、`src/supabaseSync.js`、`styles.css`、`pku_swm_420_plan.md`、`scripts/check-js.mjs` 等被迁入/删除），但完全未落盘。同时 Git 反复告警 `CRLF will be replaced by LF`——缺 `.gitattributes`。

#### ⑤ 文档数字滞后

| 文档自述 | 实测 |
| --- | --- |
| `app.js` 约 6,444 行 | **6,984 行** |
| `base.css` 约 9,151 行 | 9,152 行（差 negligible，但同页数据口径不一） |
| `src` 下 39 个 JS 模块 | **43 个** |
| 612+ 测试 / 36 个文件 | **623 测试 / 38 个文件** |
| README 项目结构未列出 `src/config/`、`src/data/detailed-study-plan.js`、`study-plan-governance.js`、`core/route-contract.js`、`storage-contract.js`、`.github/` | 均存在 |

### 3.4 架构风险（量化）

#### 风险 A：`app.js` 单文件承担五种职责

6,984 行里同时包含：状态迁移与清洗、云端同步编排与合并算法、表单绑定与校验、路由与视图切换、以及 **70 个页面的 HTML 模板生成**。单函数体积最大者：

| 函数 | 字符数 |
| --- | --- |
| `renderWeekPlanner` | 6,446 |
| `createDailyTasks` | 5,396 |
| `migrateState` | 4,675 |
| `renderTasks` | 4,351 |
| `renderPlanCards` | 3,952 |
| `renderResourcePlaybooks` | 3,911 |

`renderWeekPlanner` 一个函数就超过 `docs/PROJECT_AUDIT.md` 自己设定的"页面模块 300 行"提醒线一个数量级。

#### 风险 B：19 个模块 / 5,944 行"已测试但不进入生产包"的双轨实现

| 归属 | 模块（行数） |
| --- | --- |
| `core/` | `router.js` (239) |
| `domain/` | `plan-generator.js` (447)、`calibration-engine.js` (238)、`review-queue.js` (224)、`retrospective-engine.js` (204)、`task-contract.js` (177)、`project-showcase.js` (170)、`source-registry.js` (150) |
| `infrastructure/` | `sync-service.js` (567)、`offline-cache.js` (338)、`supabase-client.js` (33) |
| `views/` | `today-view.js` (812)、`settings-view.js` (448)、`retrospective-view.js` (470)、`showcase-view.js` (350)、`records-view.js` (317)、`reviews-view.js` (312)、`weekly-view.js` (284)、`fact-index-view.js` (164) |

这些不是垃圾代码——`views/*` 有完整的 `mount/unmount` 生命周期、JSDoc 标注了需求编号（2.1 / 3.3 / 5.1…），`domain/*` 有属性测试。**但没有一行进入生产包**，而 `app.js` 里又各自有一份等价实现。同一套业务规则存在两个真源，修改时必须同步两处，否则测试全绿而线上行为不同。

#### 风险 C：生产关键路径几乎没有行为测试

把测试文件按"是否真正 import 被测模块"分类后：

| 模块 | 测试方式 |
| --- | --- |
| `app.js`（6,984 行，**唯一生产实现**） | ❌ 仅 `app-imports.test.js` 用 `readFileSync` + 正则断言源码文本 |
| `main.js`、`ui/auth-panel.js`、`ui/workspace-controller.js`、`core/storage-contract.js` | ❌ 无任何测试引用 |
| `infrastructure/supabase-sync.js` | ✅ 通过 mock SDK 动态导入测试（这是正确的做法） |
| `infrastructure/sync-service.js`、`offline-cache.js`、`core/*`、`domain/*`、`views/*` | ✅ 有测试，但**是未接入的平行层** |

结论：**通过测试保护的是那 5,944 行未上线的代码，真正跑在用户浏览器里的 6,984 行几乎裸奔。** 这解释了为什么一个"623 项测试全绿"的项目会同时出现门禁红灯。

#### 风险 D：HTML / JS / CSS 三处耦合

`index.html` 1,116 行承载全部 10 个视图的静态骨架，`app.js` 通过 150 个 DOM ID 定位并填充。**新增一个字段要在三处同步修改**（HTML 骨架 + JS 渲染 + CSS 样式），缺一处就是静默失败。`PROJECT_AUDIT.md` 已识别此问题并给出迁移顺序，但尚未执行。

#### 风险 E：CSS 的"覆盖层"自相矛盾

README 规定"样式加载顺序固定为 base 后 workspace，**不要再新增根目录 CSS 覆盖层**"，但 `workspace.css` 本身就是 5,974 行的覆盖层，且 `!important` 用了 40 处（base.css 12 处、study-plan.css 13 处，合计 65 处）。`PROJECT_AUDIT.md` 已指出"部分看似重复的规则是在后置位置重建层叠优先级"，也就是说**这些重复是有意为之的债务**——只能靠截图回归逐段消解。

#### 风险 F：存在同义反复测试

`tests/properties/sync-showcase.prop.test.js` 内注释写着 `sync-service doesn't exist yet`，随后在测试文件里**内联重写了一份 last-write-wins 冲突合并逻辑**并对它做属性测试。这验证的是测试自己的副本，不是任何生产代码——零回归价值，还会给出虚假的覆盖率信心。

### 3.5 产物与性能现状

| 产物 | 体积 | gzip |
| --- | --- | --- |
| `app-*.js` | 324.16 KB | 112.66 KB |
| `vendor-supabase-*.js`（懒加载） | 208.80 KB | 54.70 KB |
| `infra-*.js` | 29.25 KB | 9.53 KB |
| `domain-*.js` | 14.54 KB | 7.13 KB |
| `vendor-icons-*.js` | 6.31 KB | 2.46 KB |
| `index-*.css` | **370.91 KB** | 86.55 KB |
| `index.html` | 48.5 KB | — |
| 字体（103 个 woff2） | 约 5.5 MB | — |

**首屏关键路径 ≈ 362 KB（未压缩）/ 123 KB（gzip）**，对无框架应用偏重——主要原因不是依赖，而是 `app.js` 内的模板与内容数据。CSS 单文件 371 KB 未按路由拆分；Noto Sans SC 靠 `unicode-range` 按需下载（实际只加载当前页面用到的切片），但仍撑大了产物目录。

---

## 4. 升级改进建议

### P0 · 让门禁回绿（半天内，且必须先做）

1. **修 4 项契约测试**。不要改回 `app.js`，而是把断言从"源码字面量"改为行为断言：`supabase-sync-auth.test.js` 已有的 mock SDK + 动态导入模式就是正确范式。
2. **接上 `hasPersistedCloudSession()`**。在 `initCloudSession()` 用它（或"URL 带 auth 回跳参数"）守门，恢复首屏零云端开销，同时解掉浏览器门禁红灯。这是 10 行改动，收益最大。
3. **`npm audit fix`** 升级 `vitest` 至 `>=4.1.11`，消除 2 个 moderate。
4. **把 60 个文件的重组分批提交**（建议按"迁移 → 删旧 → 清 lint → 修测试"拆 4~6 个语义 commit），并新增 `.gitattributes`（`* text=auto eol=lf`）止住 CRLF 噪声。
5. **校正 README 与 `PROJECT_AUDIT.md` 的数字**，或者在 README 里删掉易腐化的精确行数，改为"以 `npm run quality` 输出为准"。

### P1 · 架构收敛（本季度，按既有路线图执行）

6. **执行 `docs/PROJECT_AUDIT.md` 的接管顺序**：设置页 → 今日 → 记录 → 复盘 → 最后换同步实现。铁律是**每接管一页就删掉 `app.js` 里对应的 `bind*`/`render*`/HTML 骨架**，绝不新增而不删旧。当前最大风险不是"没迁移"，而是"迁移了一半且两套都在"。
7. **给 `app.js` 补纯函数行为测试**。优先测 `migrateState`（4,675 字符的状态迁移）、40+ 个 `sanitize*`、`applyTombstones`、`mergeStateByUpdatedAt`、`mergeArrayById`——这些都是纯函数，只需 jsdom fixture，不需要重构就能测，是当前性价比最高的动作。
8. **路由级代码分割**。`views/*` 已实现 `mount/unmount`，接入后配合 `() => import('./views/today-view.js')` 即可把 324 KB 的 app chunk 显著切小。
9. **CSS 分层并引入 `@layer`**：`tokens → base → layout → components → views → utilities`，然后把 65 处 `!important` 与 `workspace.css` 的覆盖逐段消解。**必须逐段做截图回归**（`scripts/verify-local.mjs` 已是现成基线），不要一次性重写。
10. **删除 `sync-showcase.prop.test.js` 的内联 helper**，改为在 `sync-service.js` 接入后再测真实实现。

### P2 · 工程化补齐

| 建议 | 理由 / 具体做法 |
| --- | --- |
| 引入类型检查 | 最低成本：加 `jsconfig.json` + `tsc --checkJs --noEmit`，先只守 `domain/`、`core/`、`utils/`；中期再迁 TS |
| 覆盖率门禁 | `@vitest/coverage-v8`，先跑出基线再设"不倒退"阈值（不追求 80%） |
| 格式化与提交钩子 | `Prettier` + `.editorconfig` + `husky` + `lint-staged`；配合 `commitlint` 约束提交信息 |
| 迁移到 `@playwright/test` | 现自研脚本没有 trace / retry / HTML 报告 / 并行，失败定位成本高。迁移后可保留现有断言逻辑，仅换壳 |
| 接入 axe-core | 加 `@axe-core/playwright`，在每个路由的冒烟里跑一次无障碍扫描。现在 ARIA 全靠人工，而项目的 a11y 投入其实不低，值得自动化守住 |
| 错误可观测性 | 线上异常目前只能靠用户口述。最低成本：全局 `window.onerror` + `unhandledrejection` 上报到一个自建端点；集成 Sentry 更佳 |
| `engines` + 版本管理 | `package.json` 补 `engines`，可选 `volta`；CI 加 Node 20 / 22 矩阵 |
| 安全响应头 | `vercel.json` 补 `Content-Security-Policy`（注意放行 `data:` 图标与 Vite 内联）、`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Strict-Transport-Security` |
| 性能预算 | `build` 后断言各 chunk gzip 体积上限；可选 Lighthouse CI |
| 仓库元文件 | `LICENSE`、`CHANGELOG.md`（`APP_BUILD` 已有版本号，可直接挂上） |

### P3 · 产品与体验（多为 `PROJECT_AUDIT.md` 已列但未做）

11. **同步可信度**：明确区分"仅本机 / 等待上传 / 已同步 / 冲突待处理 / 同步暂停"五态并显示最后成功时间；导入与恢复前展示记录数差异与 diff 预览；完成后提供短时撤销。这是当前用户体验上最薄弱的一环。
12. **任务 → 记录的就地闭环**：完成任务后就地展开最小表单（分钟、题量、错因、明日第一任务），一次保存同时更新任务 / 记录 / 复盘队列，并提供撤销。目前必须切到"今日"页填 12 个字段。
13. **重新生成计划的差异预览**：展示保留项、被替换项、顺延项及原因，避免误覆盖已开工的任务。
14. **PWA**：`offline-cache.js` 已经写好却没接入。加 manifest + Service Worker 即可获得离线可用与桌面安装——这对"本地优先"的定位是天然契合的补齐。
15. **趋势图合并**：现在有多张重复数字卡（`metric-grid` / `secondary-metrics` / `ringGrid` / `subjectChart` / `trendChart` / `heatmap`），建议收敛为一张可切换 7/14/30 天与科目筛选的主图，其余降级到"详尽"密度。
16. **考点证据链**：让"已掌握"能回溯到具体错题 / 复盘记录 / 模考错因，形成双向链接。当前 `captureTopicEvidence` 只存文本与解析出的数值。
17. **提醒能力**：今日开始提醒 + 到期复盘提醒，默认关闭、用户主动授权（可用 Web Notification，PWA 落地后体验更完整）。

---

## 5. 复现命令与证据

```powershell
# 建议统一使用项目内安装的二进制，避免 shell 差异
$NODE = "C:\Users\13561\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"

& $NODE ./node_modules/eslint/bin/eslint.js .          # 0 报错
& $NODE ./node_modules/vitest/vitest.mjs --run        # 4 failed | 619 passed (623)
& $NODE scripts/verify-local.mjs                      # FAIL: Supabase SDK loaded without a persisted session
& $NODE scripts/verify-no-green.mjs                   # {"ok":true}
& $NODE ./node_modules/vite/bin/vite.js build         # ✓ built in 9.05s
npm audit --audit-level=moderate                      # 2 moderate (vitest, @vitest/mocker)
git status --short | wc -l                            # 60
git diff --stat HEAD | tail -1                        # 36 files changed, +2506, -14092
```

**关键文件索引**

| 关注点 | 文件 |
| --- | --- |
| 生产唯一实现（最高风险） | `src/app.js`（6,984 行） |
| 懒加载缺口的修复点 | `src/app.js:1230-1268`（`initCloudSession`） |
| 已实现但未被调用的守卫 | `src/infrastructure/supabase-sync.js:57`（`hasPersistedCloudSession`） |
| 失效的契约断言 | `tests/unit/app-imports.test.js` |
| 同义反复测试 | `tests/properties/sync-showcase.prop.test.js` |
| 未接入的平行实现 | `src/views/`（8 文件）、`src/core/router.js`、`src/infrastructure/sync-service.js`、`offline-cache.js` |
| 既有迁移路线图 | `docs/PROJECT_AUDIT.md` |
