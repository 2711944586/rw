# 前端参考与技术栈升级记录

## 参考产品

本轮查看了 [MyStudyLife](https://mystudylife.com/) 和 [Todoist 中文站](https://www.todoist.com/zh-CN)。前者围绕课程、任务、考试与日历组织学习周期；后者让收件箱、今天和即将到来成为明确的任务入口。学习台采用了这类产品共同的工作流重点：先呈现今天的下一步，再给出本周状态和少量校准信息，避免把首页做成数据仪表盘或营销页。产品信息结构借鉴其任务优先原则，没有复刻品牌图形或页面布局。

视觉方向使用偏冷的浅灰画布、白色工作面、清晰的深色文字和克制的钴蓝行动色。任务科目保留独立语义色，蓝色只承担主要操作与焦点提示。总览将主行动和执行状态组成稳定的两列网格，窄屏改为单列；信息层级由标题、行动面板、状态卡片和详情组成。

## 技术决策

| 层 | 当前实现 | 本轮处理 |
| --- | --- | --- |
| 前端 | 原生 ES modules、语义 HTML、CSS、Vite 8 | 保留轻量静态架构；整理共用主题变量和工作台布局，不引入第二套 UI 系统 |
| 语言与检查 | JavaScript + TypeScript `checkJs`、ESLint 10 | 保留渐进类型检查和模块边界门禁 |
| 认证 | Supabase JS 2、Supabase Auth 邮箱密码 | 补齐恢复邮件、`PASSWORD_RECOVERY` 回站识别和 `updateUser` 新密码提交 |
| 本机状态 | `localStorage` 同步主存 | 启动时比较保存时间，并从较新的 IndexedDB 镜像恢复；写入镜像不阻塞页面主流程 |
| 云端同步 | Supabase PostgreSQL、多表归属键、RLS | 整库保存串行化、保存前复核账号、分页读取使用稳定排序键 |
| 数据库变更 | 编号 SQL migrations + 完整 schema | 新增 016 增量索引和 `NOT VALID` 数据检查约束；不改写已应用 migration |
| 自动化验证 | Vitest、真实 Chromium、构建预算、CSP 和依赖审计 | 为恢复库和认证流程增加测试，延续 320 至 1440px 浏览器门禁 |

截至本记录日期，项目的 Vite、Supabase JS、TypeScript、ESLint、Vitest 与 Playwright 均已处于现代版本范围。没有证据表明迁移到 React/Next.js 或更换托管数据库会解决当前问题；一次性框架迁移会扩大回归范围，却不会改善本地优先数据流程。维护工作继续按用户流程拆分，并让测试和类型门禁覆盖新增模块。

## 登录与密码恢复

1. 用户在账号面板输入注册邮箱并选择“忘记密码”。
2. 客户端通过 Supabase Auth `resetPasswordForEmail` 发送邮件，回跳地址使用当前站点 origin。
3. Supabase 返回 `PASSWORD_RECOVERY` 认证事件后，账号面板进入新密码模式；邮箱锁定为当前账号，密码字段使用 `new-password` 自动填充语义。
4. 提交时调用 `updateUser({ password })`，并保留已建立的会话。

生产 Supabase 项目的 Auth URL Configuration 必须将生产域名加入 Site URL/Redirect URLs。部署前要用实际邮箱验证收信、回跳、改密和使用新密码再次登录。恢复邮件成功提示不透露邮箱是否注册，减少账号枚举信息。

## 本机恢复与同步边界

- `localStorage` 仍是即时保存的权威副本，业务代码不需要改成异步数据库接口。
- IndexedDB 保存完整状态副本，只用于浏览器重启时恢复较新的已保存状态；它与主站同源、受同一浏览器配置文件管理，丢失设备时不能代替云同步。
- 若浏览器不支持 IndexedDB、配额不足或被其他标签页阻塞，应用继续使用 `localStorage`。阻塞后迟到成功的数据库请求会立即关闭连接。
- 手动导出 JSON 仍是用户可携带备份。显式清理本地数据会同时删除恢复副本。
- 登录后从云端读取使用稳定的过滤和排序键；写入操作串行执行，且账号 ID 在实际写表前重新确认。多设备编辑仍可能需要用户处理冲突，不能视为实时协作。

## 数据库迁移 016

`supabase/migrations/016_sync_query_indexes_and_data_checks.sql` 增加：

- `study_tasks`、`review_items` 和 `mock_scores` 的活动/删除记录分页组合索引，以及最近快照查询索引。
- 每日记录、学习任务、复盘、模考成绩和考点进度的检查约束。约束以 `NOT VALID` 添加：迁移不会扫描并拒绝已有历史行，但新的插入/更新会执行检查。

旧项目的操作顺序：

1. 确认最近一次 Supabase 备份可用，并从 Dashboard SQL Editor 执行该 migration 文件一次。不要再次执行已经应用过的迁移，也不要只修改线上表而不把变更记录到文件。
2. 查询索引是否存在：

```sql
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'study_tasks_active_sync_page_idx',
    'study_tasks_deleted_sync_page_idx',
    'review_items_active_sync_page_idx',
    'review_items_deleted_sync_page_idx',
    'mock_scores_active_sync_page_idx',
    'mock_scores_deleted_sync_page_idx',
    'snapshots_user_recent_idx'
  )
order by indexname;
```

3. 查询约束是否存在以及历史数据是否已经验证：

```sql
select conname, convalidated
from pg_constraint
where conname in (
  'daily_records_nonnegative_values_check',
  'study_tasks_valid_state_check',
  'review_items_valid_state_check',
  'mock_scores_nonnegative_values_check',
  'topic_progress_bounds_check'
)
order by conname;
```

迁移刚执行完时 `convalidated = false` 是预期状态。之后可以先清理违反约束的历史数据，再逐条 `VALIDATE CONSTRAINT`；不要在没有检查旧值前批量验证。

迁移应用是可补偿回退：遇到新写入被约束拒绝时，先根据错误定位并修复该用户数据；若必须恢复旧写入行为，可删除这五个新增约束。新增索引可独立删除，不承载业务数据。SQL migration 不包含生产数据写入，也没有在本轮连接或修改线上 Supabase 项目。

## 发布验证

代码发布前执行 `npm run quality`。部署数据库 migration 后，用测试账号完成登录、密码恢复、本机离线记录、恢复镜像、手动同步与另一设备拉取；在 Supabase Table Editor 确认新数据仍受用户归属策略隔离。迁移验证查询应返回 7 个索引和 5 个约束。生产部署与 migration 应分开记录，避免把 Vercel 静态构建的成功当作数据库已升级。
