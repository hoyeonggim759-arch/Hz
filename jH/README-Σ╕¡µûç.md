# JinqSMS｜安全任务工作台（本地 + VPS 完整项目）

这份项目把 Next.js 前端、NestJS 后端和 PostgreSQL 数据库整合在一个仓库中。**手机号真实执行程序按你的要求留给你自己接入**；本项目负责账号、会员、任务记录、状态、日志、客服和管理后台，不会把“写入任务队列”伪装成“已经真实执行”。

## 已包含的功能

- 新用户注册时必须同时验证一次性会员卡密、用户 ID 和密码；注册交易会原子地创建账号、消耗卡密并开通会员。已有用户登录只需要 ID 和密码。密码使用 Argon2id 哈希；登录态使用 HttpOnly Cookie。
- 后端验证登录状态、账号状态和管理员权限。
- PostgreSQL + Prisma 数据库及首个 SQL 迁移文件。
- 管理员生成会员卡密；卡密只存 HMAC 哈希；一次性兑换；会员时间顺延。
- 用户提交任务记录（1–300 分钟）、查看自己的历史、日志和状态、提交停止请求。
- 用户客服会话；管理员后台查看并回复。
- 管理后台：数据概况、用户暂停/恢复、卡密生成、任务列表、审计日志。
- 基础 API 限流、来源 Origin 检查、安全响应头。
- Dockerfile、Docker Compose、Caddy HTTPS 反向代理示例。

## 一、本地 Windows 运行（不需要购买 VPS）

**需要：** Windows 10/11、Node.js 22+、Docker Desktop。

1. 解压 ZIP，进入有 `package.json` 的项目根目录。
2. 复制环境配置：
   ```powershell
   Copy-Item .env.example .env
   ```
3. 用记事本打开 `.env`，至少修改以下值：
   - `POSTGRES_PASSWORD`：PostgreSQL 管理员密码（不要给应用使用）。
   - `APP_DB_USER`：应用数据库账号，默认 `saas_app`。
   - `APP_DB_PASSWORD`：应用运行账号的独立密码。
   - `MIGRATION_DB_USER`：数据库迁移专用账号，默认 `saas_migrator`。
   - `MIGRATION_DB_PASSWORD`：迁移账号的独立密码。
   - `DATABASE_URL`：连接 `saas_app`，密码使用 `APP_DB_PASSWORD`。
   - `MIGRATION_DATABASE_URL`：连接 `saas_migrator`，密码使用 `MIGRATION_DB_PASSWORD`。
   - `SESSION_SECRET`：至少 32 个字符的随机密钥。
   - `LICENSE_PEPPER`：另一条不同的随机密钥，至少 32 个字符。
   - `APP_DATA_KEY`：单独生成的 64 位十六进制密钥，用于 AES-256-GCM 加密数据库中的手机号和客服消息。
   - `ADMIN_LOGIN_ID`：初始管理员 ID。
   - `ADMIN_PASSWORD`：初始管理员密码，至少 14 个字符。

   PostgreSQL 容器首次初始化时会自动创建两个账号：应用运行账号 `APP_DB_USER` 只有数据读写权限；迁移账号 `MIGRATION_DB_USER` 才能创建/修改表结构。应用只使用运行账号。若更改数据库账号密码，已有数据卷不会自动重新执行初始化脚本。

   PowerShell 可用以下命令生成随机密钥（每次单独运行，生成不同值；`APP_DATA_KEY` 也用此命令生成）：
   ```powershell
   [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   ```
4. 打开 Docker Desktop，启动本地 PostgreSQL：
   ```powershell
   docker compose -f infra/compose.yaml up -d postgres
   ```
5. 安装依赖：
   ```powershell
   npm install
   ```
6. 生成 Prisma Client：
   ```powershell
   npm run db:generate
   ```
7. 初始化数据库（首次执行）：
   ```powershell
   npm run db:migrate -- --name init
   ```
8. 创建初始管理员：
   ```powershell
   npm run db:seed-admin
   ```
9. 开一个 PowerShell 窗口启动后端：
   ```powershell
   npm run dev:api
   ```
10. 再开一个 PowerShell 窗口启动前端：
    ```powershell
    npm run dev:web
    ```
11. 浏览器打开：
    - 前端：`http://localhost:3000`
    - 后端健康检查：`http://localhost:4000/api/health`

## 二、本地 Linux / macOS 运行

在项目根目录执行：

```bash
cp .env.example .env
# 编辑 .env，填入不同的随机密钥和管理员账号

docker compose -f infra/compose.yaml up -d postgres
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed-admin
```

然后在两个终端分别运行 `npm run dev:api` 和 `npm run dev:web`。

## 三、以后部署 VPS（现在不用买）

建议 Ubuntu 22.04/24.04 或 Debian 12。购买服务器后再做这部分：

1. 安装 Docker Engine 和 Docker Compose 插件。
2. 把整个项目上传到 VPS 并解压，复制 `.env.example` 为 `.env`。
3. 设置强随机 `POSTGRES_PASSWORD`、`APP_DB_PASSWORD`、`MIGRATION_DB_PASSWORD`、`SESSION_SECRET`、`LICENSE_PEPPER`、`APP_DATA_KEY` 和管理员账号。
4. VPS 的 `.env` 中设置：
   - `NODE_ENV=production`
   - `APP_ORIGIN=https://你的域名`
   - `NEXT_PUBLIC_API_URL=/api`
   - `DATABASE_URL` 使用 `localhost` + `APP_DB_USER`，`MIGRATION_DATABASE_URL` 使用 `localhost` + `MIGRATION_DB_USER`；Compose 会自动覆盖容器内地址，连接私有 `postgres` 服务。
5. 在域名 DNS 中把 A 记录指向 VPS 公网 IP。
6. 构建镜像：
   ```bash
   docker compose -f infra/compose.yaml build
   ```
7. 启动数据库：
   ```bash
   docker compose -f infra/compose.yaml up -d postgres
   ```
8. 应用生产数据库迁移：
   ```bash
   docker compose -f infra/compose.yaml run --rm migrate
   ```
9. 创建管理员：
   ```bash
   docker compose -f infra/compose.yaml run --rm bootstrap
   ```
10. 启动前后端：
    ```bash
    docker compose -f infra/compose.yaml up -d
    ```
11. 安装 Caddy 并按 `deploy/Caddyfile.example` 配置域名反向代理。Caddy 将 `/api/*` 转发到 `127.0.0.1:4000`，其他请求转发到 `127.0.0.1:3000`，并自动申请/续期 HTTPS 证书。
12. 检查 `https://你的域名/api/health`，然后先由管理员生成会员卡密；新用户在注册页同时输入卡密、用户 ID 和密码。管理员账号仍通过初始化脚本创建，并登录 `/admin`。

**防火墙只开放 SSH、80、443。** PostgreSQL 不对公网开放；Compose 中 Web 和 API 端口只绑定 `127.0.0.1`。长期运行的 API 容器只拿到应用数据库账号和运行密钥；数据库超级用户、迁移账号和初始管理员密码只在数据库或一次性操作容器中使用。

## 四、目前明确未包含的内容

- **手机号真实执行 Worker：** 不包含，按你的要求由你自行配置。当前任务 API 创建 `QUEUED` 记录、停止时写入 `STOP_REQUESTED`；真实 Worker 需要读取队列、检查授权和会员状态、执行你的业务逻辑、更新任务状态并追加日志。
- **在线支付：** 尚未接入支付服务商；当前使用管理员生成的卡密激活会员。
- **自助找回密码：** 暂未开放，避免仅凭卡密重置账号造成盗号。
- **客服附件上传：** 暂未开放文件上传；文字客服可用。

## 五、加密数据库备份

安装 `age` 后，在 `.env` 中填写 `BACKUP_AGE_RECIPIENT`（age 公钥），执行：

```bash
./scripts/backup-postgres.sh
```

脚本会从 PostgreSQL 容器导出数据并使用 age 公钥加密到 `backups/`。**加密备份仍需复制到 VPS 以外的独立存储**；age 私钥必须离线、独立保存。没有异地复制和恢复演练，不能算完成灾备。

## 六、安全和运维提醒

- 不要把 `.env`、数据库密码、管理员密码、`SESSION_SECRET`、`LICENSE_PEPPER` 或 `APP_DATA_KEY` 发给别人或提交到 Git。
- `LICENSE_PEPPER` 丢失或更换后，旧卡密哈希无法再匹配；`APP_DATA_KEY` 丢失后，数据库中的手机号和客服消息无法解密。两者都必须安全备份。
- 当前 API 限流是单进程内存版。多实例部署时应换成 Redis 共享限流，并由可信反向代理设置客户端 IP。
- 正式上线前应配置加密异地备份并实际测试恢复。
- 不要把排队记录显示成真实执行成功；真实 Worker 必须有独立的状态回报和日志。

## 七、上线前还必须完成的安全项目

这份代码已经做了应用层基础加固，但不能仅凭代码 ZIP 就宣称“顶级安全”或通过安全审计。正式开放公网前还需要：

- VPS SSH 公钥登录、禁止 root 远程登录、主机防火墙、自动安全更新和入侵告警。
- Cloudflare DNS/WAF/DDoS 配置；如要隐藏源站，需限制源站 80/443 只接受 Cloudflare 官方 IP 段，并核查 IPv4/IPv6/DNS 历史泄露。
- 管理员 MFA（本项目当前没有内置 MFA）。
- 多实例部署时使用 Redis 等共享限流；当前限流只在单个 API 进程内有效。
- 异地备份自动上传、离线密钥保管和真实恢复演练。
- 依赖安装后生成并保存 `package-lock.json`，部署时使用锁定依赖；上线前执行依赖漏洞扫描、越权测试和独立安全审计。

10–30 美元预算可以做出安全设计良好的单机起步版，但单台 VPS 不能提供真正的高可用、跨区灾备或企业级安全运营能力。


## 品牌与界面

- 品牌名称：JinqSMS。登录、注册、工作台和管理页面采用统一暗色界面。
- 工作台提供蓝、紫、青三种强调色；选择会保存在当前浏览器，并应用到整个站点。
- 工作台保留手机号任务提交、会员信息、任务记录和客服入口；不包含“查询 Q 绑”模块。
- 生产构建关闭浏览器 Source Map；开发环境仍可使用 Next.js 正常调试。
