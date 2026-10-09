# 更新日志

本文件记录本项目的显著变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed

- 根目录增加 `start-local.bat`。双击即可安装缺失依赖并打开本地学习台。
- 顶栏去掉「01 / 行动」这类编号。页名下面改成一句话说明这一页做什么，密度开关改成「行动 / 执行 / 诊断」。
- 侧栏按「今天 / 路线 / 证据」分组。辅助文字从 `#65748a`、`#96a3b5` 加深到 `#4d5d74`、`#5d6d84`，深色主卡片上的说明改成 `#e4eaf4`。
- 总览在指标上方增加近 14 天投入柱。模考页在均分下面画出最近 10 套总分。设置页分成时间预算、排程方向、复盘规则，字段标出分钟、天和百分比。
- 工作台改成同一张冷灰纸：外壳、页面和卡片同色，分区只用发丝线，去掉白底、内高光和卡片投影。页面区块按 200ms 依次进入。手机底栏仍是贴底色条。
- 今日记录按分钟、题量、身体与档位、收口分组。窄屏每组一列，避免标签和输入挤在同一行。
- 复盘横幅与本周数字共用同一条结论。到期积压时不再一边写需要降载、一边写可加难度。
- 复盘档位 again / hard / good / easy 可写入 `review_items.last_result`。睡眠、疲劳、档位继续放在每日备注标记里，拉取时不再把空疲劳读成 3。
- domain 包 gzip 预算由 9 KB 调到 12 KB。执行闭环纯函数进入生产包后实测 9.27 KB，新上限与 infra 相同，仍会拦住明显膨胀。
- 工作台视觉回到 2026-09-22 的暖白侧栏和藏青主行动卡。模块拆分、已修复的同步与登录行为、Supabase 结构保持不动。
- 本地审核入口固定为 `scripts/start-local.bat` 与 `npm run start:local`。服务已在 `5173` 运行时只打开浏览器。
- 根目录只保留工具会自己发现的文件。启动脚本、部署模板和变更记录留在 `scripts/` 与 `docs/`。

### Added

- `supabase/migrations/016_sync_query_indexes_and_data_checks.sql`：同步分页索引与 `NOT VALID` 写入检查。同一语句已并入 `supabase/schema.sql`。
- `src/infrastructure/recovery-store.js`：本机 IndexedDB 恢复镜像。

## [4.1.2] - 2026-09-22

本轮主题：**界面缺陷修复**。评审方式与完整结论见
[`docs/history/DESIGN_REVIEW_2026-09-22.md`](docs/history/DESIGN_REVIEW_2026-09-22.md)——先构建产物、灌入 23 天真实数据、
在 3 种视口逐页截图阅读，再用浏览器实测判定每一处"是缺陷还是数据问题"。

### Fixed

- **移动端总览页卡片只占半屏**：`workspace.css` 的 `@media (max-width: 620px)` 把 `.focus-board`
  设成两列，它在 `max-width: 760px` 的单列规则之后，于是在 390px 手机上反而胜出——含标题、说明、
  时长和 CTA 的主卡片被压到 179px，CTA 折成三行。删除该规则后恢复全宽 370px。
- **设置页科目复选框视觉破损**：`base.css` 有两条表单输入规则（`min-height: 40px` 与
  `min-height: 44px`）同时命中复选框，把它拉成 13×44，原生勾号与文字重叠。两条都加上
  `:not([type="checkbox"]):not([type="radio"])`，复选框恢复 13×13、胶囊由 58px 降到 33px。
- **风险指标显示颜色名**：`当前风险 绿色 / 红色 / 黄色` 改为语义标签
  `节奏正常 / 略偏紧 / 需降载`。原先"绿色"还是项目自己已淘汰的配色词。
- **"学习曲线"语义错配**：该指标实际是"近 7 天 ÷ 前 7 天"的周环比比值，标签改为"投入趋势"，
  文案改为"与前一周基本持平"这类显式环比表述，不再是曲线被一个百分比概括。
- **考点页同屏重复**：免责句原本拼在每个分组摘要里，13 个分组就重复 13 遍，现移到图例的
  `title` 上每类型一次；与 `#syllabusBoard` 完全重复的 `syllabus-group-bars` 分区整块删除
  （含死 CSS），页面由 4 列变 3 列等高，第一列近 400px 的空白随之消失。
- **复盘页自相矛盾**：横幅的"需要降载"由复盘积压（>3 项）驱动，网格的"可小幅加难度"只由
  时长/核心占比/天数驱动，两个相反结论出现在同一屏。现在复盘积压优先，会输出"先清复盘再加量"；
  同时删掉网格中与横幅重复的 3 个指标。
- **模考页近半屏空白**：趋势面板的 `.panel.wide`（`grid-column: 1 / -1`）把它挤到第二行，
  第一行第二列（320–420px）整块空着。去掉 `wide` 后两列并排。
- **错因备注是单行输入框**：改为 `<textarea rows="3">` 并配样式——它是散文，不是编号或分数。
- **总览页"本周状态 34.8 / 14h"** 补上第一个数字的单位。

### Added

- `tests/unit/import-sanitizers.test.js`（16 项）：导入边界的**行为**测试，替换
  `app-imports.test.js` 中两个用 `new Function()` 把 app.js 源码切片后重新执行的用例——那两处
  在我给 `sanitizeTask` 增加一次函数调用后立刻抛 `ReferenceError`，因为它们执行的是副本而非真模块。

### Changed

- `sanitizeTask` / `sanitizeReviewItems` 现在经 `normalizeSubjectLabel` 把科目键归一化为中文标签。
  任务是按标签存储的，而 `subjectToEntryKey` 只认标签：云端行或旧版本地数据若带 `subject: "math"`，
  界面会渲染裸键，且"任务→记录"的字段映射会静默返回 `null`。
- `migrateState` 的兜底 `catch` 不再静默：它此前会吞掉任何迁移异常并返回全新状态，
  **等于无声清空全部记录**。本轮我在其中引入的暂时性死区错误正是被它吞掉的，
  由新增的集成测试抓到"条目重挂载后消失"；现在会打印错误。
- `tests/unit/app-imports.test.js` 再删 2 个用例，**2,248 → 1,882 行**（累计从 2,672 行减少 30%）。
- 测试总数 **716 → 730**（42 个文件）。

### 未修（需产品决策，已记入评审文档）

- 模考页与总览页**没有趋势图**（模考页标题写着"模考趋势"却无图；项目已有图表组件可复用）。
- 设置页 13 个字段挤在一张卡片里，无分组、无单位标注。
- 资料页顶部摘要卡片与下方时间线重复同一段话（属摘要 vs 详情关系，与考点页的整列重复性质不同）。
- **布局层缺少单一事实来源**：`.focus-board` 的列定义有 21 条竞争规则、断点横跨 8 档、
  分布在两个文件；本轮三处布局缺陷都不是"值写错了"，而是"写对了被别的规则盖住"。
  这是界面无法稳定达到顶尖的根本原因，需要一次按组件分层的布局收敛 + 外观回归门禁。

## [4.1.1] - 2026-09-22

本轮主题：**修复 `v4.1.0` 引入的生产 CSP 缺陷，并补上产物级门禁**。`v4.1.0` 新增的
`style-src 'self'` / `font-src 'self'` 会在生产上拒绝全部内联样式与内联字体，而当时所有门禁
只跑 Vite dev server（不发送安全响应头），因此缺陷在门禁全绿的情况下上线。

### Fixed

- **进度条、环形图与柱状图在生产上全部归零**：`style-src 'self'` 不含 `'unsafe-inline'`，
  而 CSP3 中内联 `style` 属性由 `style-src-attr` 管辖并回退到 `style-src`，导致模板字符串里
  的 `style="..."` 被浏览器拒绝应用（实测 138 处违规、44 个内联属性被拒）。
  `src/app.js` 的 14 处内联样式改为在 `data-fill` / `data-height` / `data-var-value` 上承载数值，
  渲染收尾统一经 CSSOM 应用（CSP 不管辖 CSSOM 写入），严格策略得以保留。
- **部分汉字在生产上回退系统字体**：Vite 默认把小于 4 KB 的资源内联为 base64，3 个 woff2
  切片以 `data:` 形式进入 CSS，被 `font-src 'self'` 拦截。`vite.config.js` 增加
  `build.assetsInlineLimit: 0`，字体改为独立文件并各自参与缓存。

### Added

- `scripts/verify-csp.mjs` + `npm run test:csp`：用 `vercel.json` 的**真实响应头**托管 `dist/`，
  在 Chromium 中遍历全部 10 个路由，断言零 CSP 违规、零控制台错误，且没有
  `data-fill` / `data-height` / `data-var-value` 元素漏应用样式。已接入 `quality` 链的
  `build` 与 `test:budget` 之后。
- `scripts/verify-local.mjs` 的路由循环新增同一条"延后样式必须已应用"断言，让开发期门禁也能
  拦住绕过 `applyDeferredStyles()` 的新渲染路径。
- `scripts/verify-module-boundaries.mjs` + `npm run test:boundaries`：从 `src/main.js` 重算模块
  可达性，与 `PENDING_MIGRATION` 清单双向比对。`docs/PROJECT_AUDIT.md` 的"哪些模块不进入生产包"
  此前已与代码漂移过一次（`state-manager.js` / `event-bus.js` 实际在包内），该清单的权威定义
  现在落在脚本里，任一侧漂移都会失败。
- `scripts/verify-css-debt.mjs` + `npm run test:css-debt`：`!important` 棘轮，逐文件设上限、只降不升。
  `!important` 的消解需要逐段截图回归，无法一次完成，因此先锁住总量（当前 75 处）。
- `tests/support/bootstrap-harness.js`：集成测试脚手架。`app.js` 在 Vitest 下会跳过 bootstrap，
  这是生产编排层长期没有行为测试的根因；脚手架通过 `globalThis.__RW_BOOTSTRAP__` 显式开启真实
  bootstrap，并补齐 jsdom 缺失的 `scrollTo` / `matchMedia` / `requestIdleCallback` / `dialog.showModal`。
- `tests/unit/app-integration.test.js`（18 项）：挂载真实 `index.html`、运行真实 `bootstrapApp`，
  驱动页面断言路由与无障碍状态、账号弹层、重置流程、表单校验、导出内容与重载后的持久化。
- `tests/unit/state-merge.test.js`（28 项）：云合并层的行为断言，覆盖 `mergeStateByUpdatedAt` /
  `mergeSettingsByVersionedAssets` / `mergeCustomTasks` / `mergeTopicState` / `mergeVersionedObject` /
  `mergeObjectsByUpdatedAt` / `mergeWeekPlans` / `pruneTombstone`，含幂等性与原型污染防护。
- `tests/unit/router.test.js` 新增 7 项契约一致性断言（契约路由必须是 `VIEW_IDS` 成员、
  迁移层专属路由单独声明、默认路由必须是合法视图 ID）。

### Changed

- `src/app.js`：新增 `applyDeferredStyles()` 与 `DEFERRED_STYLE_RULES`；在渲染协调器的
  `renderAfter()` 以及两条绕开协调器的路径（`bindForms → renderTasks`、
  `bindSyllabusTabs → renderSyllabus`）末尾调用。
- `index.css` 产物由 370.91 KB / gzip 86.55 KB 降到 358.60 KB / **gzip 75.18 KB**（预算余量
  由 8.45 KB 扩大到 19.82 KB）。
- `docs/history/AUDIT_2026-09-22.md` 补充本轮复核结论与修复结果。
- `src/ui/density-controller.js`：删除 `StateManager` 导入与 `getDensityMode` / `setDensityMode` /
  `initDensityMode`。三者在生产与迁移层都无人调用（各视图有自己的本地实现），唯一消费者是一个
  单元测试，却因此把 `state-manager.js`（605 行）与 `event-bus.js`（139 行）拖进了生产包——
  而 `state-manager.js` 绑定的是与 `app.js` **同一个** localStorage 键，其 `saveState` 会用
  页面加载时的陈旧快照整体覆盖主状态。`applyDensityMode` 的缺省回退改为常量，不再急切求值
  `getDensityMode()`。生产 `app` chunk gzip **113.56 → 110.26 KB**。
- `src/core/router.js`：视图表拆为 `CONTRACT_ROUTES`（4 个契约内路由）与 `MIGRATION_ONLY_ROUTES`
  （4 个语义不同的迁移层页面，例如 `weekly` 是周总结而生产 `week` 是周计划）；hash 写入由
  `#/<route>` 改为 `#<route>` 以与 `app.js` 一致（读取仍容忍旧形式）。
- `scripts/verify-no-green.mjs`：扫描范围由 `src/styles/` 扩到 `src/**/*.{css,js}`，并修掉两个
  假阳性——HTML 实体 `&#096;` 被读成十六进制颜色、`#fbfcfa` 这类近白色因 HSL 饱和度公式在
  极端明度下失真被误判为绿色（新增最小彩度门槛）。
- `scripts/verify-production.mjs`：新增 6 项安全响应头与 `vercel.json` 的逐项比对、CSP 违规收集、
  延后样式漏应用断言。同时修掉两个使脚本本身不可用的缺陷——它在 390px 移动视口下点击全部 9 个
  导航项（移动端只有 5 个可见），以及把移动端故意收成 1px 的 `#syncStatusText` 判为文字裁切。
- `lucide` 由 `^1.16.0` 显式升到 `^1.47.0`：原范围允许漂移到 1.47.0，但锁文件钉在 1.16.0，
  重建锁文件会静默改变图标。升级后 10 个导航图标全部渲染出真实路径，图标几何门禁通过。
- `tests/unit/app-imports.test.js`：删除 15 个已被行为测试覆盖的源码文本用例，**2,672 → 2,248 行**；
  文件头写明它是"变更探测器而非回归探测器"，并指明新增断言应优先放入行为测试。
- 测试总数 **685 → 716**（41 个文件）。

### Removed

- `src/app.js` 中 `--mobile-width` 与 `--bar` 两个内联自定义属性：全仓无任何 CSS 消费、
  无任何 JS 读取，属死代码；随之移除未再使用的 `subjectPalette` 导入。
- `src/data/study-content.js` 的 `subjectPalette` 导出：移除上述导入后已零消费者，且其中的
  `math: "#13785f"`（色相 165.1°、饱和度 0.727）违反项目自身的"禁用绿色系"约定——配色门禁
  此前只扫 CSS，所以这个值一路进了生产。

### Security

- 生产 CSP 保持严格姿态：`style-src 'self'`、`font-src 'self'` 均未放宽为 `'unsafe-inline'`
  或 `data:`，修复走的是渲染层改造而非策略降级。

## [4.1.0] - 2026-09-15

本轮主题：**门禁回绿 → 补齐工程化配套 → 校正文档**。质量门禁从全红恢复为全绿，并首次接入类型检查、
体积预算与安全响应头。

### Added

- `jsconfig.json`：对 `src/config`、`src/core`、`src/data`、`src/domain`、`src/infrastructure`、`src/utils`
  开启 `checkJs` 类型检查（`src/app.js`、`src/main.js`、`src/core/router.js`、`src/ui/**`、`src/views/**`
  暂不在范围内，原因写在文件注释里）。
- `npm run typecheck`（`tsc --noEmit`）并接入 `quality` 链与 CI。
- `eslint.config.js`（flat config）+ `npm run check` 改为 `eslint .`，替换已删除的 `scripts/check-js.mjs`。
- `@vitest/coverage-v8` + `npm run test:coverage`，`vitest.config.js` 增加 `test.coverage` 与不倒退阈值
  （statements 49 / branches 45 / functions 49 / lines 50）。
- `scripts/verify-budget.mjs` + `npm run test:budget`：按 chunk 前缀聚合产物的 **gzip** 体积并设上限
  （app ≤ 125 KB、index.css ≤ 95 KB、vendor-supabase ≤ 60 KB、infra ≤ 12 KB、domain ≤ 9 KB、vendor-icons ≤ 4 KB）。
- `scripts/verify-local.mjs`（`npm run test:browser`）与 `scripts/verify-no-green.mjs`（`npm run test:palette`）
  两项本地门禁，前者覆盖五档宽度的浏览器渲染与控制台无错，后者校验配色不出现被淘汰的绿色系。
- `scripts/clean.mjs`、`scripts/verify-study-plan-ui.mjs`（`npm run test:study-plan-ui`）。
- `src/infrastructure/supabase-sync.js` 的 `hasPersistedCloudSession()`：只有本地存在已持久化的会话时
  才加载云 SDK，未登录用户不再为 `@supabase/supabase-js` 付出首屏代价。
- 契约模块：`src/core/route-contract.js`、`src/core/storage-contract.js`、`src/infrastructure/sync-contract.js`，
  把路由表、存储键与同步表/冲突键收敛为单一事实来源。
- `src/infrastructure/browser-storage.js`：`localStorage` 的容错封装（无存储环境下退化为内存态）。
- 测试：`tests/unit/state-rules.test.js`（`app.js` 纯函数行为）、`browser-storage`、`route-contract`、
  `sync-contract`、`detailed-study-plan`、`study-plan-governance`、`ui-infrastructure` 等新增用例。
- `.editorconfig`、`LICENSE`（专有声明）、`CHANGELOG.md`。
- `package.json` 增加 `engines: { node: "^20.19.0 || >=22.12.0" }`，让 README 口述的 Node 要求变成机器约束。
- `vercel.json` 增加 `/(.*)` 全路径安全响应头：CSP、`X-Content-Type-Options`、`Referrer-Policy`、
  `X-Frame-Options`、HSTS、`Permissions-Policy`。
- 文档：`docs/PROJECT_AUDIT.md`、`docs/STUDY_PLAN.md`、`docs/history/TECH_AUDIT_2026-09-15.md`。

### Changed

- 字体改为自托管（`@fontsource-variable/geist`、`@fontsource-variable/noto-sans-sc`），
  不再依赖第三方字体 CDN，配合 CSP 的 `font-src 'self'`。
- 计划默认值从「6 月 15 日启动」改为「8 月 31 日证据校准 + 9 月 15 日学习计划 v4」
  （`supabase/migrations/014_*`、`015_*`）。
- `src/app.js` 拆分出纯函数并导出，供 `tests/unit/state-rules.test.js` 直接覆盖；
  `src/domain/*`、`src/views/*` 与 `index.html` 同步调整到新的计划与配色体系。
- `vitest` 升级到 4.1.11、`vite` 升级到 7.3.6（`vite` 移入 devDependencies），
  `npm audit --audit-level=moderate` 归零。
- `.gitattributes` 统一换行与文本/二进制处理；README 与 `docs/PROJECT_AUDIT.md` 的模块数、行数、
  测试数、产物体积全部按实测值校正。

### Fixed

- `src/data/study-plan-governance.js`：`stageControlRules` 补 `Array<[RegExp, string, string, string]>`
  标注，`pattern.test(name)` 不再落到 `string | RegExp` 的联合类型上。
- `src/domain/review-queue.js`、`src/domain/study-strategy.js`：日期差改为 `.getTime()` 相减，
  去掉隐式 `Date → number` 转换。
- `src/domain/task-contract.js`：`validateMasteryPromotion` / `checkMasteryDemotion` 的 JSDoc
  按实现把可缺省字段标为可选（实现本就容忍 `{}` 入参）。
- `src/infrastructure/sync-service.js`：`pullRemoteState` 的返回值类型补上实际存在的 `failed?: string[]`。
- `tests/properties/sync-showcase.prop.test.js`：删除本地内联的 `resolveConflict` /
  `syncWithErrorPreservesDirty` 副本，改为对真实 `sync-service` 实现做属性断言（消除自证式测试）。

### Removed

- `scripts/check-js.mjs`（被 ESLint 取代）、`src/density.js`、`src/referenceData.js`、`src/supabaseSync.js`
  与根目录 `styles.css`（旧样式已迁入 `src/styles/`）。
- `pku_swm_420_plan.md`（内容并入 `docs/STUDY_PLAN.md`）。

### Security

- 生产站点新增 CSP 等六项安全响应头，`object-src 'none'` + `frame-ancestors 'none'` 收紧攻击面。
- 云 SDK 懒加载，未登录状态下不实例化 Supabase 客户端。
