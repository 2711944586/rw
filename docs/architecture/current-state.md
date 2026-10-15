# 当前架构

生产路径只有一条：`src/main.js` 恢复本机数据，再加载 `src/app.js`。路由、渲染和状态保存都在 `app.js`。`src/core/router.js`、`src/core/state-manager.js` 和 `src/infrastructure/sync-service.js` 仍是待迁移模块，页面不会同时跑两套。

## 状态

- 主键：`pku_swm_420_dashboard_v3`。
- 写入前先对账 `WRITE_CONTRACT.storageKey`。不一致就在序列化前抛错。
- 本机另有 IndexedDB 恢复镜像，它不是第二份权威状态。
- `planVersions` 存在这份状态里，也在本机快照和云端快照的允许字段里。每版只留被替换那天的任务，最多 20 版。
- 错题和会话仍在状态 JSON 里，没有新表。

## 学习闭环

目标在设置里。今日任务仍由 `createDailyTasks` 写出科目、正文和分钟。排序和取舍交给 `capacityOrderDailyTasks`：它调用 `generateDailyPlan`，再按任务 id 映回原来的任务。锁定任务和英语任务即使引擎丢掉也会留下。没有更早学习记录时，连续缺勤按 0 天算，不会因此进入恢复计划。已有学习记录、并且向前 7 天都没有正分钟时，缺勤天数才会交给引擎。

未锁定任务在超出剩余时间时仍可能被缩短。锁定分钟不会被这次缩短改掉。容量冲突由 `src/domain/plan-capacity.js` 说明。计时使用 `src/domain/study-session.js`。结果通过 `validateCompletionEvidence` 进入当天记录，并安排复盘。重排与撤销由 `src/domain/plan-version.js` 保存上一版。

## 生产权威

路由是 `app.js` 的 `setRoute`。状态是同一份 `saveState` 和 `pku_swm_420_dashboard_v3`。同步是 `queueCloudSync`。`core/router.js`、`core/state-manager.js`、`infrastructure/sync-service.js` 和 `views/today-view.js` 不从 `main.js` 或 `app.js` 导入。`tests/unit/production-authority.test.js` 锁住这条边界。
