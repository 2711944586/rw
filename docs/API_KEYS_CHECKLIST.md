# API 密钥获取和填写清单

项目根目录：

```text
D:\TRAEDATA\rw
```

你最终只需要手动填写这个文件：

```text
D:\TRAEDATA\rw\.env.deploy
```

创建方式：

```powershell
Copy-Item D:\TRAEDATA\rw\.env.deploy.example D:\TRAEDATA\rw\.env.deploy
notepad D:\TRAEDATA\rw\.env.deploy
```

本地开发只需要 Supabase 前端变量时，填写这个文件：

```text
D:\TRAEDATA\rw\.env
```

创建方式：

```powershell
Copy-Item D:\TRAEDATA\rw\.env.example D:\TRAEDATA\rw\.env
notepad D:\TRAEDATA\rw\.env
```

## 1. GitHub

仓库地址：

```text
https://github.com/2711944586/rw
```

填入：

```env
GITHUB_REPO=2711944586/rw
```

### GitHub Token

如果你本机已经能正常 `git push`，可以先不填：

```env
GITHUB_TOKEN=
```

如果要让脚本通过 GitHub API 创建仓库或操作私有仓库，创建 token。

Classic token：

```text
https://github.com/settings/tokens/new
```

Fine-grained token：

```text
https://github.com/settings/personal-access-tokens/new
```

建议权限：

```text
Repository access: 只选 2711944586/rw
Contents: Read and write
Metadata: Read-only
```

如果要自动创建仓库，需要允许创建 repository；不想折腾权限时，手动先创建仓库，然后 `GITHUB_TOKEN` 留空。

填入：

```env
GITHUB_TOKEN=粘贴你的GitHubToken
```

## 2. Supabase

Supabase Dashboard：

```text
https://supabase.com/dashboard
```

### Supabase Access Token

创建地址：

```text
https://supabase.com/dashboard/account/tokens
```

点击创建 token，复制后填入：

```env
SUPABASE_ACCESS_TOKEN=粘贴你的SupabaseAccessToken
```

### Supabase Org ID

用途：让脚本自动创建 Supabase 项目。

如果你已经手动创建 Supabase 项目，可以不填：

```env
SUPABASE_ORG_ID=
```

获取方式：

```powershell
npx supabase login
npx supabase orgs list
```

复制组织 ID 后填入：

```env
SUPABASE_ORG_ID=你的组织ID
```

### Supabase Project Ref

如果你已经创建项目，打开项目首页，URL 类似：

```text
https://supabase.com/dashboard/project/abcdefghijklmnop
```

这里的：

```text
abcdefghijklmnop
```

就是 `SUPABASE_PROJECT_REF`。

填入：

```env
SUPABASE_PROJECT_REF=abcdefghijklmnop
```

项目首页通用地址：

```text
https://supabase.com/dashboard/project/YOUR_PROJECT_REF
```

把 `YOUR_PROJECT_REF` 替换成你的 ref。

### Supabase Database Password

这是你创建 Supabase 项目时设置的数据库密码。

填入：

```env
SUPABASE_DB_PASSWORD=你的数据库密码
```

不要把这个密码填到 Vercel 环境变量里。

### Supabase Project URL

打开：

```text
https://supabase.com/dashboard/project/YOUR_PROJECT_REF/settings/api
```

复制 `Project URL`，形如：

```text
https://abcdefghijklmnop.supabase.co
```

填入：

```env
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
```

### Supabase Publishable Key

同一个页面：

```text
https://supabase.com/dashboard/project/YOUR_PROJECT_REF/settings/api
```

复制：

```text
Publishable key
```

填入：

```env
VITE_SUPABASE_PUBLISHABLE_KEY=粘贴你的PublishableKey
```

注意不要复制 `service_role` key。

### Supabase Auth URL Configuration

生产部署完成后打开：

```text
https://supabase.com/dashboard/project/YOUR_PROJECT_REF/auth/url-configuration
```

填写：

```text
Site URL:
https://你的生产域名
```

Redirect URLs：

```text
https://你的生产域名/**
http://127.0.0.1:5173/**
http://localhost:5173/**
http://127.0.0.1:5174/**
http://localhost:5174/**
```

## 3. Vercel

Vercel Dashboard：

```text
https://vercel.com/dashboard
```

### Vercel Token

创建地址：

```text
https://vercel.com/account/tokens
```

创建后复制，填入：

```env
VERCEL_TOKEN=粘贴你的VercelToken
```

### Vercel Project Name

建议固定：

```env
VERCEL_PROJECT_NAME=rw
```

项目创建后，项目设置地址通常是：

```text
https://vercel.com/PROJECT_OWNER/rw/settings
```

环境变量页面通常是：

```text
https://vercel.com/PROJECT_OWNER/rw/settings/environment-variables
```

把 `PROJECT_OWNER` 换成你的 Vercel 用户名或团队名。

### Vercel Team ID

个人账号部署通常留空：

```env
VERCEL_TEAM_ID=
```

只有用团队空间部署时才填。

### Production URL

第一次生产部署前可以留空：

```env
PRODUCTION_URL=
```

部署完成后，Vercel 会给你类似：

```text
https://rw.vercel.app
```

然后可以补回：

```env
PRODUCTION_URL=https://rw.vercel.app
```

## 4. 最小可用填写示例

如果 Supabase 项目已经手动创建，推荐这样填：

```env
GITHUB_REPO=2711944586/rw
GITHUB_PRIVATE=true
GITHUB_TOKEN=
DEPLOY_COMMIT_MESSAGE=Automated deployment

SUPABASE_ACCESS_TOKEN=粘贴你的SupabaseAccessToken
SUPABASE_ORG_ID=
SUPABASE_PROJECT_NAME=rw-study
SUPABASE_REGION=ap-southeast-1
SUPABASE_PROJECT_REF=你的项目ref
SUPABASE_DB_PASSWORD=你的数据库密码
SUPABASE_SCHEMA_MODE=schema

VITE_SUPABASE_URL=https://你的项目ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=你的PublishableKey

VERCEL_TOKEN=你的VercelToken
VERCEL_PROJECT_NAME=rw
VERCEL_TEAM_ID=
PRODUCTION_URL=
```

## 5. 填完后运行

Preview：

```powershell
cd D:\TRAEDATA\rw
npm run deploy:all
```

Production：

```powershell
cd D:\TRAEDATA\rw
npm run deploy:prod
```

生产部署后，回到 Supabase Auth URL Configuration 填生产域名。

## 6. 不能填错的安全项

只能给前端和 Vercel 使用：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

不能填到 Vercel，也不能进前端代码：

```text
SUPABASE_DB_PASSWORD
SUPABASE_ACCESS_TOKEN
GITHUB_TOKEN
VERCEL_TOKEN
service_role key
JWT secret
```
