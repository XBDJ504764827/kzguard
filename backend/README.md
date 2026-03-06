# Backend

后端当前使用 `Fastify + TypeScript + pnpm` 进行脚手架搭建，并提供前端首版所需的原型接口。

## 已提供接口

- `GET /api/health`
- `GET /api/communities`
- `POST /api/communities`
- `POST /api/communities/:communityId/servers`
- `GET /api/whitelist`
- `POST /api/whitelist/applications`
- `POST /api/whitelist/manual`
- `PATCH /api/whitelist/:playerId/status`
- `GET /api/users/summary`

## 运行方式

```bash
pnpm --filter backend dev
pnpm --filter backend build
pnpm --filter backend start
```

## 当前说明

- 数据暂存于进程内存，重启服务后会回到种子数据
- RCON 校验仍为后端模拟逻辑
- 网站用户模块仅保留占位接口
