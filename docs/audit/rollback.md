# 回滚

1. 回滚代码时回到升级前提交 `55e68c0d7d651fb58cf978cad73abc74f5d55640`。
2. 回滚学习者数据前，先在设置里导出 JSON。导入前页面会留下 `before-import` 快照；取消导入不会替换当前数据。
3. 模式版本 4 只增加 `studyGoal`、`adaptivePriority`、`aiAssist`、`mistakes`、`sessions`，并把退役的 `focus` 密度改成 `balanced`。旧记录、模考、任务和复盘仍留在原来的字段里。
4. 数据库迁移 `018_density_mode_balanced.sql` 把 `profiles.density_mode` 默认值改为 `balanced`，并把已有 `focus` 行改成 `balanced`。检查约束以 `NOT VALID` 加上，不改写更早的迁移文件。
5. 若新版本读不了某份备份，保留该 JSON，不要在失败导入后继续保存。用导入前快照恢复。
