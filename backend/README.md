# Backend

后端现已切换为 `Rust + Axum + SQLx + MySQL + Redis`，不再使用 Node.js / TypeScript 运行时。

## 当前能力

- 网站管理登录、登出、会话校验
- 社区组 / 服务器管理
- 服务器 RCON 验证
- 在线玩家上报与玩家管理
- 白名单申请、审核、公示，系统管理员可手动录入/编辑/删除，普通管理员仅可审核申请且拒绝需填写缘由
- 封禁管理、公示、编辑、解除封禁、删除
- 网站后台解除封禁时，会同步调用游戏服本地 `sm_unban`
- 网站管理员新增与登录
- 服务器准入控制：白名单、进服验证、白名单优先
- SourceMod 插件实时校验 + 本地缓存兜底

## 服务器准入规则

- 仅开启白名单：只有白名单玩家可进入服务器。
- 仅开启进服验证：玩家需同时满足最低 `rating` 和最低 `Steam 等级`。
- 同时开启白名单与进服验证：白名单玩家优先放行；非白名单玩家仍需满足进服验证。

后端会把服务器准入快照写入 Redis，快照中包含：

- `isWhitelisted`：是否在白名单中
- `meetsEntryVerification`：是否满足当前服务器的进服验证条件
- `canJoin`：最终是否允许进入
- `message`：给插件和后台使用的判定说明

这些快照会在以下时机刷新：

- 服务启动预热时
- 服务器在线玩家上报成功后
- 白名单手动新增 / 编辑 / 删除 / 审核状态变更后
- 服务器设置更新后
- 插件主动请求同步时
- 插件实时校验单个玩家时

## 对 SourceMod 插件提供的内部接口

这两个接口都要求请求头携带：

- `X-Plugin-Token: <该服务器实例对应的 plugin_token>`

接口列表：

- `POST /api/internal/server-presence/report`
  - 插件上报当前服务器在线玩家
- `GET /api/internal/server-access/check?serverId=...&steamId64=...`
  - 实时判定单个玩家是否允许进入服务器
  - 返回纯文本键值，例如 `allow=1`
- `GET /api/internal/server-access/sync?serverId=...`
  - 返回该服务器的准入快照
  - 响应格式为 SourceMod `KeyValues` 文本，插件会把它并入共享缓存文件中的对应服务器分区

## 网站接口

已提供的主要接口包括：

- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/health`
- `GET /api/communities`
- `POST /api/communities`
- `PATCH /api/communities/:communityId`
- `DELETE /api/communities/:communityId`
- `POST /api/communities/:communityId/servers/verify-rcon`
- `POST /api/communities/:communityId/servers`
- `PATCH /api/communities/:communityId/servers/:serverId`
- `DELETE /api/communities/:communityId/servers/:serverId`
- `GET /api/communities/:communityId/servers/:serverId/players`
- `POST /api/communities/:communityId/servers/:serverId/players/:playerId/kick`
- `POST /api/communities/:communityId/servers/:serverId/players/:playerId/ban`
- `GET /api/whitelist`
- `POST /api/whitelist/manual`
- `PATCH /api/whitelist/:playerId`
- `DELETE /api/whitelist/:playerId`
- `PATCH /api/whitelist/:playerId/status`
- `GET /api/bans`
- `POST /api/bans/manual`
- `PATCH /api/bans/:banId`
- `POST /api/bans/:banId/revoke`
- `DELETE /api/bans/:banId`
- `GET /api/admins`
- `POST /api/admins`
- `PATCH /api/admins/:adminId`
- `GET /api/operation-logs`
- `GET /api/users/summary`
- `GET /api/public/steam/resolve`
- `GET /api/public/whitelist/history`
- `GET /api/public/whitelist`
- `POST /api/public/whitelist/applications`
- `GET /api/public/bans`

## 运行方式

在 `backend` 目录中执行：

```bash
cargo run
cargo build
cargo run --release
cargo check
```

如果在仓库根目录执行：

```bash
cargo run --manifest-path backend/Cargo.toml
cargo build --manifest-path backend/Cargo.toml
cargo run --manifest-path backend/Cargo.toml --release
cargo check --manifest-path backend/Cargo.toml
```

## 开发环境默认配置

默认连接：

- Host: `0.0.0.0`
- Port: `3000`
- MySQL Host: `192.168.0.62`
- MySQL Port: `3306`
- MySQL User: `text`
- MySQL Password: `text`
- MySQL Database: `text`
- Redis: `redis://:redis_CWBbcK@192.168.0.62:6379/`

## 环境变量

可通过环境变量覆盖：

- `HOST`
- `PORT`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `REDIS_URL`
- `REDIS_PLAYER_PRESENCE_TTL_SECONDS`
- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_PASSWORD`
- `DEFAULT_ADMIN_DISPLAY_NAME`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_NOTE`
- `GOKZ_API_BASE_URL`
- `STEAM_WEB_API_KEY`
- `STEAM_LEVEL_API_BASE_URL`
- `STEAM_LEVEL_API_FALLBACK_BASE_URL`
- `PLAYER_PROFILE_STALE_SECONDS`

说明：

- `STEAM_WEB_API_KEY` 必须通过环境变量或部署系统注入，不要直接写进仓库。
- `PLAYER_PROFILE_STALE_SECONDS` 用于控制 Redis 中玩家 `rating` / `Steam 等级` 缓存的过期刷新时间。

## 默认系统管理员

服务第一次运行时，如果数据库里还没有系统管理员账号，会自动创建：

- 用户名：`root_admin`
- 密码：`Admin@123`

这些默认值也可通过环境变量覆盖，生产环境建议启动前立即修改。

## plugin_token

- 每台网站中的服务器实例都会自动生成一个独立的 `pluginToken`。
- 老数据在后端启动时也会自动补齐 `pluginToken`。
- 插件与后端的内部通讯现在使用 `pluginToken`，不再复用游戏服 `RCON` 密码。
