# 第二轮测试证据

日期：2026-10-10。命令都在 `D:\DATA\rw` 执行。工作区尚未提交，所以下面没有新的提交哈希。

| 项目 | 完成条件 | 结果 |
| --- | --- | --- |
| 容量排序 | 锁定任务和原文留下；到期复盘排在新专题前 | `npx vitest --run tests/unit/capacity-daily-plan.test.js` 通过，3 项 |
| 生产权威 | `app.js` 和 `main.js` 不导入第二套路由、状态、同步 | `tests/unit/production-authority.test.js` 通过 |
| 计划容器与集成 | 锁定周计划、导入导出和首次启动不回退 | `tests/unit/app-imports.test.js` 43 项、`tests/integration/app-integration.test.js` 23 项通过 |
| 全量测试与覆盖率 | 现有行为不回退，并记下真实覆盖率 | `npm run test:coverage`：53 个文件、784 项通过。全文件语句 71.18%、分支 61.24%、函数 73.77%、行 74.03%。`app.js` 自身语句 53.75%、分支 42.96%、函数 58.85%、行 55.86%。门槛仍是 49/45/49/50 |
| 类型与静态检查 | 改动文件无新的检查错误 | `npx eslint` 覆盖 `app.js`、容量模块和测量脚本，通过。`npx tsc --noEmit -p jsconfig.json` 通过 |
| 模块边界 | `plan-generator.js` 从待迁移名单移除后，可达模块与名单一致 | `npm run test:boundaries`：可达 39，未进包 21，与名单一致 |
| 浏览器门禁 | 十条路由与五档宽度 | `npm run test:browser` 通过。十条路由，320/390/768/1024/1440，无横向溢出 |
| 构建与体积 | domain gzip 不超过 18 KB | `npm run build` 后 `npm run test:budget`：domain 17.16 KB（预算 18），app 119.72 KB（预算 125），index CSS 77.80 KB（预算 95），vendor-supabase 54.80 KB（预算 60），infra 11.60 KB（预算 12），icons 2.47 KB（预算 4） |
| 线上 RLS | 两个身份不能互相读写 | 见下方。事务已回滚，测试用户残留 0 |
| 实验室性能 | 本机预览测出 LCP、CLS 和一次交互 | 见下方。不是 CrUX，也不是线上字段数据 |

截图仍在 `docs/audit/screenshots/`，来自上一轮界面走查。这次排程接入没有重拍这些图。

## 线上 RLS

2026-10-10 用已关联的 Supabase 项目做了只读查询和一次写入演练。查询输出里的连接串和令牌没有写入本文件。

12 张业务表都开了 RLS。每张表一条 `for all` 策略，`using` 和 `with check` 都是 `(user_id = auth.uid())`。表名：`profiles`、`daily_records`、`study_tasks`、`review_items`、`topic_progress`、`mock_scores`、`resources`、`snapshots`、`source_registry`、`conflicts`、`calibration_snapshots`、`project_showcase_items`。

演练插了两个不会提交的 `auth.users` 和一行 `daily_records`，然后用 `set local role` 加上请求里的 `sub` 切换身份。异常让事务中止。随后清点，测试用户数是 0。

| 检查 | 结果 |
| --- | --- |
| 账号 B 读取账号 A 的 `daily_records` | 0 行 |
| 账号 A 读取自己的同一行 | 1 行 |
| `anon` 读取该行 | 0 行 |
| 账号 B 替账号 A 插入一行 | 拒绝 |

其余 11 张表只核对了策略文本，没有逐张做跨账号写入。

`anon` 和 `authenticated` 对这 12 张表仍有 `TRUNCATE` 等表级权限。Postgres 的 `TRUNCATE` 不走 RLS。PostgREST 不暴露 `TRUNCATE`。本轮没有改线上授权。

## 实验室性能

命令：`node scripts/measure-lab-vitals.mjs`，连续跑了两次。对象是 `npm run build` 之后的本机 Vite preview，Chromium，1440×900，空的本地存储。Event Timing 只记录至少 16 毫秒的事件。两次数字差得明显，所以都留下，不取较好的一次。

| 次序 | 路由 | LCP | 交互前 CLS | 交互后 CLS | 点击类事件 |
| --- | --- | --- | --- | --- | --- |
| 1 | `#dashboard` | 312 ms | 0.0036 | 0.0036 | 没有达到 16 ms 的 `click` 或 `pointerdown`。最长事件是 `mouseover` 160 ms |
| 1 | `#today` | 216 ms | 0 | 0 | 没有达到 16 ms 的点击类事件。最长事件是 `mouseover` 56 ms |
| 2 | `#dashboard` | 448 ms | 0 | 0 | `pointerdown` 288 ms |
| 2 | `#today` | 164 ms | 0 | 0 | `pointerdown` 80 ms |

这是本机实验室读数，包含测试器移动鼠标。它不是字段 INP，也不是线上 Core Web Vitals。

## 没有做的事

- 覆盖率没有达到 80%，门槛也没有改成 80%。
- 没有把这轮构建部署到 https://rw-vert.vercel.app。线上仍是上一轮部署。
- 没有勾选 `PLAN.md` 里尚未逐项验收的复选框。
