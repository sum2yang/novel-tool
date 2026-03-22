# 小说工具台

中文优先的小说创作工作台。

它不是一个单纯的聊天生成器，而是把“立项 -> 资料吸收 -> 设定 -> 大纲 -> 章节 -> 审稿 -> 回填 -> 导出”做成了一个可登录、可保存、可部署的 SaaS 应用。

## 这个项目解决什么问题

- 作者不需要把小说工程拆成一堆零散聊天记录。
- 项目资料、设定、卷纲、章节、审稿结果都能在同一工作台里沉淀。
- AI 不再只负责“生成一段文本”，而是参与资料整理、问题发现、最小修法和状态同步。
- 模型接口、远程 MCP、Grok / Tavily / Firecrawl 都能按项目或按用户独立配置。

## 当前已经具备的能力

- 注册登录与用户隔离
- Linux DO OAuth 登录 / 注册（可选启用）
- 项目创建
- AI 引导创建与空白创建
- 作者自带资料上传
- `ingest_sources` 资料吸收与结构化整理
- `generate_setting` / `generate_outline` / `generate_chapter`
- `review_content` / `minimal_fix` / `sync_state`
- Draft / accept / revision 闭环
- 章节编辑、自动保存、审稿定位
- 项目级 API 预设
- 远程 MCP 接入
- 用户级 Grok / Tavily / Firecrawl 配置
- 导出中心与服务端归档
- Docker 本地联调
- GitHub Actions + GHCR + 远端 Docker Compose 部署
- 自动验活、自动回滚、部署报告留档

## 适合谁

- 想把长篇小说写作流程产品化、工程化的作者
- 需要“项目状态 + 资料沉淀 + AI 协作”而不是单轮对话的创作者
- 想把模型、搜索和资料链路统一进一个工作台的开发者

## 产品工作流

1. 新建项目
2. 选择 AI 引导创建，或空白创建
3. 上传作者自己的资料
4. 执行资料吸收任务，把原始材料整理成结构化内容
5. 生成设定、卷纲、章节
6. 对生成内容做审稿、最小修法和接受回填
7. 在项目中持续维护状态卡、进度和 findings
8. 导出正式章节、设定快照和项目状态摘要

## 运行架构

- 前端：Next.js App Router
- 后端：Next.js Route Handlers
- 数据库：PostgreSQL + Prisma
- 认证：Better Auth
- 对象存储：S3 兼容接口，默认可用 MinIO
- 模型接入：OpenAI / Gemini / Anthropic 自定义 URL
- 外部扩展：远程 MCP、GrokSearch 风格聚合搜索上游配置

## 环境要求

- Node.js 20+
- npm
- PostgreSQL
- Docker 与 Docker Compose

## 本地开发

### 第零步：获取源码

首次在新机器启动时，先克隆仓库并进入项目目录：

```bash
git clone https://github.com/sum2yang/novel-tool.git
cd novel-tool
```

### 方式一：Node.js

1. 安装依赖

```bash
npm install --legacy-peer-deps
```

2. 复制环境变量

```bash
cp .env.example .env
```

3. 准备 PostgreSQL，并修改 `DATABASE_URL`

示例：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/novel_tools?schema=public"
```

4. 生成 Prisma Client 并执行迁移

```bash
npx prisma generate
npm run prisma:migrate
```

5. 启动开发环境

```bash
npm run dev
```

## Docker 启动

推荐本地直接使用 Docker 跑完整环境，后续上服务器也可以沿用同一套结构。

当前 Compose 默认包含 3 个服务：

- `postgres`
- `minio`
- `app`

### 启动步骤

1. 复制 Docker 环境变量模板

```bash
cp .env.docker.example .env.docker
```

2. 修改 `.env.docker`

重点项：

- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`
- `BETTER_AUTH_URL`
- `APP_BASE_URL`
- `LINUX_DO_CLIENT_ID`
- `LINUX_DO_CLIENT_SECRET`
- `APP_IMAGE`
- `GROK_API_URL`
- `GROK_API_KEY`
- `GROK_MODEL`
- `TAVILY_API_URL`
- `TAVILY_API_KEY`
- `FIRECRAWL_API_URL`
- `FIRECRAWL_API_KEY`

说明：

- 本地 Compose 环境里 `DATABASE_URL` 默认应保持连接容器内主机名 `postgres`
- `APP_IMAGE` 本地开发时通常留空
- 当用户没有填写个人 Grok / Tavily / Firecrawl 配置时，应用会按这 7 个字段逐项回退到平台默认
- 如果同时填写 `LINUX_DO_CLIENT_ID` 和 `LINUX_DO_CLIENT_SECRET`，登录页和注册页会自动显示 `Linux DO` 登录 / 注册按钮

3. 启动

```bash
docker compose --env-file .env.docker up --build
```

4. 停止

```bash
docker compose --env-file .env.docker down
```

## 常用脚本

### 基础开发

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test`

### Prisma

- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:deploy`
- `npm run prisma:push`

### Docker

- `npm run docker:build`
- `npm run docker:up`
- `npm run docker:down`
- `npm run docker:preflight`

### 发布前校验

- `npm run validate:runtime-sources`
- `npm run validate:release`

### 联调诊断

- `npm run inspect:linux-do-auth`
- `npm run inspect:linux-do-auth -- --email your@email.com`
- `npm run inspect:linux-do-auth -- --allow-empty`

说明：

- 默认检查 `providerId=linux-do` 的最新账号绑定，并输出 `user / account / session` 关系摘要
- 默认在没有形成完整登录链路时返回非零退出码，适合联调后直接验收
- 加 `--allow-empty` 时只输出当前状态，不把“尚未落库”当成失败

### E2E / smoke

- `npm run smoke:auth-provider`
- `npm run smoke:api-presets-e2e`
- `npm run smoke:ingest-e2e`
- `npm run smoke:onboarding-e2e`
- `npm run smoke:mcp-generate`
- `npm run smoke:mcp-e2e`
- `npm run smoke:mainline-e2e`
- `npm run smoke:nonchapter-e2e`
- `npm run smoke:research-e2e`
- `npm run smoke:grok-e2e`
- `npm run smoke:export-e2e`
- `npm run smoke:deploy-remote`

## 部署方式

当前生产部署链路已经固定为：

1. `.github/workflows/release-validation.yml`
2. `.github/workflows/deploy-production.yml`
3. `scripts/deploy-remote.sh`

发布流程如下：

1. 执行 `prisma migrate deploy`
2. 执行 `npm run validate:release`
3. 执行 `npm run docker:preflight`
4. 构建并推送 GHCR 镜像
5. SSH 到服务器
6. 更新远端 `.env.docker` 中的 `APP_IMAGE`
7. 在服务器执行 `docker compose pull app && docker compose up -d --no-build`
8. 对 `/api/health` 和 `/login` 执行 smoke
9. 如果失败，自动回滚到上一版环境文件、上一版 commit 和上一版镜像

## 远端部署报告

每次部署后，服务器内会生成：

- `.deploy-reports/<deploy-id>/`
- `.deploy-reports/latest`

典型内容包括：

- `summary.json`
- `summary.md`
- `deploy-smoke-attempts.log`
- `deploy-health-last.txt`
- `deploy-login-last.txt`
- `rollback-*`
- `docker compose ps`
- `app logs`

GitHub Actions 会把这些内容回传到 Step Summary，并上传完整诊断 artifact。

## 仓库结构

- `app/`：页面与 Route Handlers
- `components/`：工作台 UI
- `lib/`：认证、模型、MCP、搜索、项目逻辑、存储等核心代码
- `prisma/`：数据库 schema 与迁移
- `knowledge/`：运行时唯一知识入口
- `archive/`：维护用标准化资料层，仅用于知识再生成
- `scripts/`：生成脚本、smoke、部署与校验脚本
- `.github/workflows/`：CI 与部署工作流

## 致谢

- **原创文本与创作思路** — [宁河图](https://linux.do/u/user2609/summary)，本项目的创作方法论、Prompt 设计与题材模板主要源自其实战经验分享
- **GrokSearch 工程启发** — 感谢孙老师的 [GrokSearch](https://github.com/GuDaStudio/GrokSearch)，为本项目的 Grok / Tavily / Firecrawl 聚合搜索接入提供了重要参考
