# JinqSMS 改版说明

## 本次界面改动

- 登录页、注册页和工作台统一使用暗色界面，表单、下拉框、卡片、弹出状态与表格均使用深色背景和高对比文字。
- 品牌统一为 JinqSMS。
- 增加蓝色、紫色、青色三种强调色；选择保存在当前浏览器，并应用于全站页面。
- 工作台改为左侧导航、顶部状态概览、手机号任务表单、会员状态卡和最近记录表格的布局。
- 不包含“查询 Q 绑”模块。

## 注册及卡密逻辑

- 新用户注册必须同时提交卡密、用户 ID、密码和密码确认。
- 服务端会在一个 Serializable 数据库事务中验证并抢占未使用卡密、创建账号、写入卡密兑换记录、开通会员。
- 卡密只能成功注册一次。重复使用、无效或过期卡密不能完成注册。
- 用户登录只需要用户 ID 和密码。
- 已有账号继续使用原 ID 和密码登录；已有用户仍可在登录后通过“卡密兑换”页面续费。
- 管理员仍从 `/admin` 生成卡密。新用户注册前，管理员必须先生成并安全交付一张卡密。

## 后端加固

- 保持 Argon2id 密码哈希、服务端账号/角色检查、任务归属校验和卡密 HMAC 摘要存储。
- 注册、卡密占用、会员开通在同一事务完成，避免卡密并发重复使用。
- 浏览器会话 Cookie 使用 `SameSite=Strict`；生产环境改用 `__Host-jinqsms_session`，并要求 HTTPS。
- 对登录、注册、卡密兑换和任务创建设置独立的 IP 速率限制。
- 增加安全响应头；生产构建关闭浏览器 Source Map。

## 更新步骤

1. 先备份当前项目目录和 PostgreSQL 数据库。
2. 解压本 ZIP，并用其中的 `nova-integrated-project` 文件覆盖/替换当前项目源代码。
3. **保留你现有的 `.env` 文件和 PostgreSQL 数据卷，不要用 `.env.example` 覆盖 `.env`。**
4. 在项目根目录执行：

   ```powershell
   npm install
   npm run db:generate
   npm run build:api
   npm run build:web
   ```

5. 本地开发仍使用两个终端：

   ```powershell
   npm run dev:api
   npm run dev:web
   ```

6. 先使用管理员账号登录 `/admin` 生成卡密，再使用卡密创建普通用户。

本次没有修改 Prisma schema 或 migration 文件，不需要执行数据库迁移。生产环境请确认 `NODE_ENV=production`、`APP_ORIGIN` 和 HTTPS 域名配置正确。

## 验证说明

已完成所有 22 个 TypeScript/TSX 文件的语法解析，未发现语法错误。当前打包环境没有项目依赖，`npm install` 在执行环境中超时，因此没有宣称已完成 Next.js / NestJS 完整生产构建；请在实际项目环境安装依赖后运行上方构建命令验证。
