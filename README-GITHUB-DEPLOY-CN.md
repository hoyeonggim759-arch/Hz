# KRSMS：通过 GitHub 部署到 VPS

本指南面向“VPS 控制面板可以连接 GitHub 仓库并自动部署”的场景。项目已提供 Dockerfile，也可以使用 Docker Compose。

> 注意：不同 VPS 服务商的 GitHub 部署界面不同。下面提供通用参数；如果你的平台字段名称不同，请按同等含义设置。不要把 `.env`、数据库密码或密钥提交到 GitHub。

## A. 推荐：控制面板支持 Dockerfile 部署

### 1. 将项目上传到 GitHub

把本目录 `KRSMS-VPS` **里面的全部内容**上传到一个私有 GitHub 仓库的根目录。确认仓库根目录直接能看到：

- `Dockerfile`
- `package.json`
- `server.js`
- `entrypoint.sh`
- `db/`
- `public/`
- `lib/`

如果你的仓库结构是 `repo/KRSMS-VPS/Dockerfile`，那么控制面板的 Root Directory / Build Context 应填写 `KRSMS-VPS`；如果 Dockerfile 在仓库根目录，Root Directory 留空或填 `.`。

### 2. 在 VPS 控制面板创建 GitHub 应用

建议设置：

| 字段 | 值 |
|---|---|
| Source | GitHub repository |
| Branch | `main`（或你的实际分支） |
| Build method | Dockerfile |
| Dockerfile path | `Dockerfile` |
| Build context / Root directory | 项目根目录（见上文） |
| Container port | `3000` |
| Start command | 留空，使用 Dockerfile 的 ENTRYPOINT |
| Health check path | `/healthz` |
| Persistent volume mount | `/data` |

本项目是单容器 Web 应用：Express 同时提供韩文前端页面和 `/api/*` API。前端与后端不需要拆成两个服务。

### 3. 配置 PostgreSQL

Dockerfile 模式只构建 KRSMS 应用容器，数据库需要单独提供。你可以：

- 在 VPS 控制面板创建 PostgreSQL 服务；或
- 使用本项目的 `docker-compose.yml` 同时运行 `db`、`app` 和 `caddy`。

将应用的 `DATABASE_URL` 设置为从应用容器可达的 PostgreSQL 连接串。不要使用 `localhost`，除非 PostgreSQL 确实与 Node 进程共享同一网络命名空间。若数据库也是 Compose 服务，主机名通常为 `db`，例如：

`postgres://krsms_app:强密码@db:5432/krsms`

数据库只应在内部网络监听，不要公开 `5432`。

### 4. 在控制面板配置环境变量

必须设置以下环境变量：

| Key | 说明 |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000`（若平台指定其他端口，使用平台分配的值） |
| `PUBLIC_ORIGIN` | 真实 HTTPS 网站地址，例如 `https://sms.example.com`，末尾不要加 `/` |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `SESSION_SECRET` | 独立随机字符串，至少 32 字符 |
| `LICENSE_PEPPER` | 与 SESSION_SECRET 不同的独立随机字符串，至少 32 字符 |
| `APP_DATA_KEY` | 独立 32 字节密钥，64 位十六进制或标准 Base64 |
| `API_CONFIG_KEY` | 另一条独立 32 字节密钥，不能与 APP_DATA_KEY 相同 |
| `DATA_DIR` | `/data` |
| `COOKIE_SECURE` | `true`（公网 HTTPS 必须启用） |
| `TRUST_PROXY_HOPS` | `1`（若你的代理链有多层，按实际情况调整） |

密钥可在安全的终端中生成，不要在聊天中分享：

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 48   # LICENSE_PEPPER（重新执行一次）
openssl rand -hex 32      # APP_DATA_KEY
openssl rand -hex 32      # API_CONFIG_KEY（重新执行一次）
```

### 5. 持久化文件目录（非常重要）

KRSMS 将加密 API 配置保存为 `/data/api-config.enc.json`。请在控制面板创建持久化存储并挂载到 `/data`，否则重新部署时文件可能丢失。

容器内应用以 Node 用户 UID `1000` 运行。若你的面板支持设置卷权限，请确保 `/data` 可由 UID/GID `1000:1000` 写入。不要把 `/data` 挂载到公开静态目录。

### 6. 首次管理员创建

最简单的方式是在首次部署前，在控制面板临时添加以下三个环境变量：

- `ADMIN_LOGIN_ID`：4–32 位字母、数字、`_` 或 `-`
- `ADMIN_PASSWORD`：至少 14 个字符
- `BOOTSTRAP_ADMIN_ON_START`：`true`

容器启动时，`entrypoint.sh` 会先迁移数据库，再执行一次管理员初始化，然后启动网站。成功日志会出现 `Administrator created: 你的管理员ID`。初始化脚本如果发现同一管理员已经存在，不会重置现有密码。

确认创建成功后，立即在控制面板删除 `ADMIN_LOGIN_ID`、`ADMIN_PASSWORD`，并将 `BOOTSTRAP_ADMIN_ON_START` 改为 `false` 或删除，然后重新部署。不要让管理员密码长期留在运行环境变量中。

### 7. 自动部署

在 VPS 控制面板启用 GitHub 自动部署，并选择 `main` 分支。以后 push 到该分支，平台会重新构建 Docker 镜像并部署。

每次更新前先备份 PostgreSQL 和 `/data/api-config.enc.json`。部署时必须保留 `/data` 持久化卷和所有密钥，尤其不能更换 `APP_DATA_KEY`、`API_CONFIG_KEY`。

## B. 如果平台支持 Docker Compose GitHub 部署

直接选择仓库中的 `docker-compose.yml`。确保 Compose 项目根目录包含 `.env`，并按 `.env.example` 设置值。首次部署可在 VPS 上执行：

```bash
cp .env.example .env
nano .env
```

请替换全部占位值，尤其 `DOMAIN`、`PUBLIC_ORIGIN`、`POSTGRES_PASSWORD`、`DATABASE_URL` 和四条密钥。将 `.env` 权限设为 `600`，不要提交 GitHub。DNS A 记录须指向 VPS。Compose 会启动 PostgreSQL、KRSMS 和 Caddy；数据库不映射公网端口。

## C. 如果平台仅支持 Node.js 源码部署

- Runtime：Node.js 22
- Build command：`npm install --omit=dev --no-audit --no-fund`
- Start command：`./entrypoint.sh`
- Port：`3000` 或平台提供的 `PORT`
- Persistent volume：挂载到 `/data`
- 另外创建 PostgreSQL，并设置上表所有环境变量。

平台必须支持在运行进程之前执行可执行的 `entrypoint.sh`。若不支持，请设置 Start command 为 `sh ./entrypoint.sh`。

## 检查与故障排查

- 健康检查：`https://你的域名/healthz` 应返回 `{"status":"ok","service":"KRSMS"}`。
- `PUBLIC_ORIGIN` 必须与浏览器地址的 scheme + host 完全匹配，例如 `https://sms.example.com`。
- `DATABASE_URL` 从应用容器内必须可达。
- 若 API 配置保存失败，检查 `/data` 的持久化卷和 UID 1000 写权限。
- 若登录 Cookie 不保存，检查 HTTPS、`COOKIE_SECURE=true` 和代理头配置。
- 不要暴露 PostgreSQL 5432、Node 3000（如果平台支持内部路由）、或调试端口到公网。

## 重要功能边界

当前任务表实现手机号授权记录、持续时间和任务状态管理；`worker/task-plugin.example.js` 默认禁用，不执行外部请求。任何外部短信服务集成都必须是本人授权的一次性验证流程，并实现冷却、次数限制和停止机制。
