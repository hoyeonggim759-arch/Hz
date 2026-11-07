# KRSMS 部署方式速查

| 部署环境 | 推荐方式 | 需要数据库 | 需要持久卷 |
|---|---|---|---|
| VPS 控制面板连接 GitHub，支持 Dockerfile | Dockerfile | 另建 PostgreSQL 服务 | `/data` |
| VPS 控制面板连接 GitHub，支持 Compose | `docker-compose.yml` | Compose 自动运行 PostgreSQL | Compose named volume |
| VPS 控制面板只支持 Node.js | Node 22 + `./entrypoint.sh` | 另建 PostgreSQL 服务 | `/data` |
| 自己管理 Ubuntu VPS | `sudo ./install.sh` | Compose 自动运行 PostgreSQL | Compose named volume |

若你不确定平台支持哪一种，请先看控制面板是否有 `Dockerfile`、`Docker Compose` 或 `Node.js` 部署选项。不要把 `.env` 或密钥上传到 GitHub。
