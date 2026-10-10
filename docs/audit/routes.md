# 路由与模块边界

生产图从 `src/main.js` 进入 `src/app.js`。

`scripts/verify-module-boundaries.mjs` 里的 `PENDING_MIGRATION` 是已测试、尚未接入生产的模块。不要把 `core/state-manager.js` 再导入 `app.js`，否则会变成第二套状态。

这次接入生产图的是纯规则和单写入口：

- `src/domain/study-phase.js`
- `src/domain/admission-catalog.js`
- `src/domain/study-session.js`
- `src/domain/mistake-record.js`
- `src/domain/review-explanation.js`
- `src/domain/study-report.js`
- `src/domain/analytics-evidence.js`
- `src/domain/priority-score.js`
- `src/domain/local-assist.js`
- `src/core/write-contract.js`
- `src/infrastructure/persistence/entity-repository.js`
- `src/infrastructure/persistence/session-lock.js`

页面仍由 `app.js` 渲染。新实体先通过仓库返回新对象，再由既有 `saveState` 写入同一个本地键。
