# 时点审计

这里保存某一天的审计、评审和交接记录。它们解释当时的测量和决定，不是当前架构契约。

当前约定以这些文件为准：

- [项目说明](../../README.md)
- [架构边界与迁移顺序](../PROJECT_AUDIT.md)
- [备考总控](../STUDY_PLAN.md)
- [技术栈升级记录](../TECH_STACK_REFRESH_2026-10-07.md)

生产包边界以 `scripts/verify-module-boundaries.mjs` 的 `PENDING_MIGRATION` 为准。文档数字和代码不一致时，以代码和 `npm run test:boundaries` 为准。
