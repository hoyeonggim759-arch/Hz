# KRSMS VPS 版（中文安装说明）

这是一套独立的新项目，可直接部署到 Ubuntu VPS。默认采用 Docker Compose：Caddy 对外提供 HTTPS，Node.js 网站服务运行前端及 API，PostgreSQL 只在 Docker 内部网络，不映射公网端口。

## 1. 需要准备

- Ubuntu 22.04 或 24.04 VPS；建议至少 2GB 内存，4GB 更合适。
- 一个域名，并把域名 A 记录指向 VPS 公网 IPv4。
- 防火墙只开放 22（建议限制为自己的 IP）、80、443。不要开放 3000 和 5432。

## 2. 上传并安装

把 `KRSMS-VPS` 文件夹上传到 VPS，然后：

```bash
cd KRSMS-VPS
sudo ./install.sh
```

按提示输入域名、管理员账号和至少 14 位密码。安装程序会：

1. 检查/安装 Docker 和 Compose。
2. 生成数据库密码、SESSION_SECRET、LICENSE_PEPPER、APP_DATA_KEY、API_CONFIG_KEY。
3. 创建 `.env`（权限 600）。
4. 启动 PostgreSQL，创建表。
5. 创建第一个管理员。
6. 启动网站和 Caddy HTTPS。

如果域名 DNS 尚未生效，先等待 DNS 指向 VPS，然后执行：

```bash
docker compose restart caddy
docker compose logs -f caddy
```

网站地址是 `https://你的域名/`，管理员页面是 `https://你的域名/admin`。

## 3. 常用操作

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f caddy
docker compose restart app
docker compose up -d --build
./scripts/backup-postgres.sh
```

恢复数据库（会覆盖当前数据，先备份）：

```bash
./scripts/restore-postgres.sh backups/krsms-YYYYMMDDTHHMMSSZ.sql.gz
```

## 4. 重要安全说明

- 不要公开 `.env`，不要把 `.env` 提交 GitHub。
- `APP_DATA_KEY` 和 `API_CONFIG_KEY` 必须备份；丢失或更换会导致旧加密数据无法解密。
- PostgreSQL 不对公网开放；网站只通过 HTTPS 访问。
- 密码不会以明文存储；管理员也无法查看用户密码。
- 卡密只存 HMAC 哈希和遮罩提示；完整卡密仅在创建时显示一次。
- 管理员账号、卡密、IP 封禁、API 配置及公告变更会记录审计日志。
- API 配置保存为 AES-256-GCM 加密 JSON 文件 `/data/api-config.enc.json`，网页不会再次返回 secret header。

## 5. 手机号和分钟数任务

用户可以填写手机号及任务时间。默认版本会保存加密号码、任务状态和截止时间，不会发送短信或向外部 API 发请求。`worker/task-plugin.example.js` 是扩展接口说明，默认关闭。这个包不包含任意远程代码执行，也不包含对手机号反复发送验证码/短信的程序。经过授权的一次性验证服务，需要使用受审核的服务商适配器，并保留冷却时间、次数限制和停止能力。

## 6. VPS 控制面板通过 GitHub 自动部署

如果你的 VPS 面板支持连接 GitHub：

1. 把本项目目录内的文件上传到 GitHub 仓库（确保 `Dockerfile` 位于部署根目录）。
2. 在面板中连接仓库和分支，选择 Dockerfile 构建，容器端口设为 `3000`，健康检查路径设为 `/healthz`。
3. 配置 PostgreSQL（面板托管数据库或使用 `docker-compose.yml`），并设置 `DATABASE_URL`。
4. 设置 `PUBLIC_ORIGIN`、`SESSION_SECRET`、`LICENSE_PEPPER`、`APP_DATA_KEY`、`API_CONFIG_KEY` 等必需环境变量。
5. 添加持久化卷挂载到 `/data`，并确保容器 UID 1000 对该目录有写权限，以保存加密 API JSON。
6. 首次创建管理员时临时设置 `BOOTSTRAP_ADMIN_ON_START=true`、`ADMIN_LOGIN_ID` 和至少 14 位的 `ADMIN_PASSWORD`。成功日志出现 `Administrator created: ...` 后，删除两个管理员变量并把 bootstrap 开关关闭，再重新部署。
7. 后续向所选 Git 分支 push，面板即可按其 GitHub 集成自动重新构建和部署。

Dockerfile 部署时应用和 API 在同一容器提供服务，PostgreSQL 必须另行提供并确保容器可达。若面板支持 Docker Compose，可以直接部署 `docker-compose.yml`，它会在内部网络运行 PostgreSQL、应用和 Caddy。

更完整的 GitHub VPS 参数请阅读 `README-GITHUB-DEPLOY-CN.md`。
