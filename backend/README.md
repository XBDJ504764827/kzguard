# Backend

后端现已切换为 `Rust + Axum + SQLx + MySQL`。

## 已提供接口

- `GET /api/health`
- `GET /api/communities`
- `POST /api/communities`
- `POST /api/communities/:communityId/servers`
- `PATCH /api/communities/:communityId/servers/:serverId`
- `POST /api/communities/:communityId/servers/:serverId/players/:playerId/kick`
- `POST /api/communities/:communityId/servers/:serverId/players/:playerId/ban`
- `GET /api/whitelist`
- `POST /api/whitelist/applications`
- `POST /api/whitelist/manual`
- `PATCH /api/whitelist/:playerId/status`
- `GET /api/bans`
- `POST /api/bans/manual`
- `PATCH /api/bans/:banId`
- `POST /api/bans/:banId/revoke`
- `DELETE /api/bans/:banId`
- `GET /api/admins`
- `PATCH /api/admins/:adminId`
- `GET /api/operation-logs`
- `GET /api/users/summary`

## 运行方式

```bash
pnpm --filter backend dev
pnpm --filter backend build
pnpm --filter backend start
```

## 开发环境数据库

默认连接：

- Host: `192.168.0.62`
- Port: `3306`
- User: `text`
- Password: `text`
- Database: `text`

也可以通过环境变量覆盖：

- `HOST`
- `PORT`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
