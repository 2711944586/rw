# 全自动部署流程

这份文档面向第一次部署的人。目标是把本项目从本机自动发布到：

```text
GitHub 仓库 -> Supabase 数据库和登录 -> Vercel 网页
```

脚本入口：

```powershell
npm run deploy:all
```

默认发布到 Vercel Preview。确认没问题后，再发布生产：

```powershell
npm run deploy:prod
```

每个 API token 的获取网址、复制内容和填写位置见：

```text
docs/API_KEYS_CHECKLIST.md
```

## 1. 免费套餐

本项目个人使用时，免费套餐够用：

- GitHub Free：保存代码。
- Supabase Free：保存登录、学习记录、任务、复盘、模考。
- Vercel Hobby：部署静态前端和自动 HTTPS。

注意：

- Supabase Free 项目长期不用可能暂停。
- Supabase Free 没有自动备份，仍建议每周在网页里导出 JSON。
- Vercel Hobby 适合个人和非商业使用。
- 免费额度可能调整，正式上线前可以再看官方 pricing 页面。

## 2. 你需要准备的 Token

全自动脚本可以不用网页手点，但需要本地配置这些 token。

不要把 token 发到聊天里，不要提交到 GitHub。只写入本机的 `.env.deploy`。

### GitHub Token

用途：创建仓库、推送代码。

如果仓库已经存在，且你本机 Git 已经能 push，可以不填 `GITHUB_TOKEN`。

获取路径：

```text
GitHub -> Settings -> Developer settings -> Personal access tokens
```

需要权限：

```text
repo
```

### Supabase Access Token

用途：创建/链接 Supabase 项目、读取 publishable key、执行 schema。

获取路径：

```text
Supabase Dashboard -> Account -> Access Tokens
```

### Supabase Org ID

用途：自动创建 Supabase 项目。

获取方式：

```powershell
npx supabase login
npx supabase orgs list
```

如果你已经手动创建了 Supabase 项目，可以不填 `SUPABASE_ORG_ID`，改填 `SUPABASE_PROJECT_REF`。

### Supabase Project Ref

用途：定位 Supabase 项目。

项目 URL 形如：

```text
https://abcdefghijklmnop.supabase.co
```

其中：

```text
abcdefghijklmnop
```

就是 `SUPABASE_PROJECT_REF`。

### Supabase Database Password

用途：执行数据库 schema。

这是你创建 Supabase 项目时设置的数据库密码。

### Supabase Publishable Key

用途：前端连接 Supabase。

脚本会尝试自动读取。自动读取失败时，到这里复制：

```text
Supabase Project -> Project Settings -> API -> Publishable key
```

### Vercel Token

用途：自动创建/链接 Vercel 项目、写环境变量、部署。

获取路径：

```text
Vercel -> Account Settings -> Tokens
```

### Vercel Project Name

建议：

```text
rw
```

脚本会用这个名字链接或创建 Vercel 项目。

## 3. 创建本地配置文件

在项目根目录运行：

```powershell
Copy-Item .env.deploy.example .env.deploy
notepad .env.deploy
```

按你的真实信息填写。

推荐新项目配置：

```env
GITHUB_REPO=2711944586/rw
GITHUB_PRIVATE=true
GITHUB_TOKEN=你的github_token
DEPLOY_COMMIT_MESSAGE=Automated deployment

SUPABASE_ACCESS_TOKEN=你的supabase_access_token
SUPABASE_ORG_ID=你的supabase_org_id
SUPABASE_PROJECT_NAME=rw-study
SUPABASE_REGION=ap-southeast-1
SUPABASE_PROJECT_REF=
SUPABASE_DB_PASSWORD=你的数据库密码
SUPABASE_SCHEMA_MODE=schema

VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

VERCEL_TOKEN=PASTE_YOUR_VERCEL_TOKEN_HERE
VERCEL_PROJECT_NAME=rw
VERCEL_TEAM_ID=
PRODUCTION_URL=
```

如果 Supabase 项目已经存在，推荐配置：

```env
SUPABASE_PROJECT_REF=你的项目ref
SUPABASE_DB_PASSWORD=你的数据库密码
VITE_SUPABASE_URL=https://你的项目ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=你的publishable_key
```

## 4. 一键部署 Preview

运行：

```powershell
npm run deploy:all
```

脚本会自动做这些事：

```text
1. 读取 .env.deploy
2. 检查 node / npm / git
3. 确认 .env / .env.deploy 不会被提交
4. npm install
5. npm run quality
6. 创建或链接 Supabase 项目
7. 写入本地 .env
8. 执行 supabase/schema.sql
9. 配置 GitHub remote
10. git add / commit / push
11. 链接 Vercel 项目
12. 写入 Vercel 环境变量
13. 部署 Vercel Preview
14. 用 Playwright 打开网页做健康检查
```

Preview 成功后，终端会输出一个网址。

## 5. 发布生产

Preview 确认没问题后运行：

```powershell
npm run deploy:prod
```

生产部署完成后，终端会输出生产 URL。

然后必须把生产 URL 写回 Supabase。

## 6. 配置 Supabase Auth URL

进入 Supabase：

```text
Authentication -> URL Configuration
```

设置：

```text
Site URL:
https://你的生产域名
```

Redirect URLs 添加：

```text
https://你的生产域名/**
http://127.0.0.1:5173/**
http://localhost:5173/**
```

如果本地脚本启动到了 5174，也添加：

```text
http://127.0.0.1:5174/**
http://localhost:5174/**
```

这一步目前建议人工核对一次，因为 Auth URL 是登录跳转的关键配置。

## 7. 验收

打开生产网址后检查：

```text
1. 页面能打开。
2. 手机端没有横向滚动。
3. 点击“账号”，登录弹窗居中。
4. 注册测试账号。
5. 保存一条学习记录。
6. 刷新页面，记录还在。
7. 换浏览器登录同一账号，记录能同步。
8. 点击“导出”，能下载 JSON。
9. Supabase Table Editor 里能看到对应数据。
```

也可以手动跑健康检查：

```powershell
node scripts/verify-production.mjs https://你的生产域名
```

## 8. 常见问题

### 提示缺少 `.env.deploy`

运行：

```powershell
Copy-Item .env.deploy.example .env.deploy
notepad .env.deploy
```

### 提示缺少某个变量

按报错补齐 `.env.deploy`。

### Supabase key 自动读取失败

手动复制 `Project Settings -> API -> Publishable key`，填入：

```env
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

### Vercel 部署成功但网页提示 Supabase 未配置

检查 Vercel 环境变量是否有：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

改完后重新运行：

```powershell
npm run deploy:prod
```

### 登录后没有跳回网页

检查 Supabase Auth URL Configuration。

### 不想自动提交 Git

运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-all.ps1 -SkipGit
```

### 只想部署，不想重新执行数据库

运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-all.ps1 -SkipSupabase
```

### 想先看 Preview，不发生产

运行：

```powershell
npm run deploy:all
```

不要加 `-Production`。

## 9. 安全底线

永远不要提交这些文件：

```text
.env
.env.deploy
.vercel/
node_modules/
dist/
```

脚本会检查 `.env` 和 `.env.deploy` 是否出现在 Git 状态里。如果出现，会停止部署。

前端只能使用：

```text
VITE_SUPABASE_PUBLISHABLE_KEY
```

绝对不要把这些放进前端或 Vercel 环境变量：

```text
service_role key
数据库密码
JWT secret
GitHub token
Supabase access token
Vercel token
```
