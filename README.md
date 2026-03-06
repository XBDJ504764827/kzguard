# KZ Guard

KZ Guard 是一个面向 CSGO 社区服的管理平台，当前仓库已经按三端拆分：

- `frontend`：React + Vite + Arco Design React 管理台前端
- `backend`：Fastify + TypeScript 后端骨架
- `csgo-plugin`：CSGO 插件占位目录，待开发

## 当前已完成

- 社区组管理页面
- 白名单管理页面
- 黑白主题切换
- 网站用户前端角色原型（系统管理员 / 普通管理员）
- 操作日志前端功能（只读、不可修改）
- 前端 API 适配层（支持 `mock` / `http`）
- 后端社区、服务器、白名单原型接口

## 使用方式

### 仅跑前端原型

```bash
pnpm install
pnpm dev
```

### 前后端联调

```bash
pnpm --filter backend dev
pnpm --filter frontend dev
```

前端默认使用 `mock` 模式。如需切到后端联调，请在 `frontend/.env` 中配置：

```bash
VITE_API_MODE=http
VITE_API_BASE_URL=http://127.0.0.1:3000/api
```

## 当前说明

- 前端保留本地 `mock` 数据模式，方便单独演示
- 网站用户模块当前先实现前端角色与资料维护原型
- 操作日志为前端本地追加式记录，界面不提供编辑和删除能力
- 后端数据暂存于内存，重启后回到种子数据
- 服务器 RCON 校验仍为原型模拟逻辑
- 白名单申请/审核流程已具备前后端接口形态
