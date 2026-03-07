# KZ Guard

KZ Guard 是一个面向 CSGO 社区服的管理平台，当前仓库已经按三端拆分：

- `frontend`：React + Vite + Arco Design React 管理台前端
- `backend`：Rust + Axum + SQLx + MySQL 后端服务
- `csgo-plugin`：CSGO 插件占位目录，待开发

## 当前已完成

- 社区组管理页面
- 白名单管理页面
- 黑白主题切换
- 网站用户前端角色原型（系统管理员 / 普通管理员）
- 操作日志展示与后端持久化
- 前端 HTTP API 适配层
- Rust 后端社区、服务器、白名单、封禁、管理员、操作日志接口
- 开发环境 MySQL 真库联调

## 使用方式

### 仅跑前端

```bash
pnpm install
pnpm dev
```

### 前后端联调

```bash
pnpm install
cargo run --manifest-path backend/Cargo.toml
pnpm --filter frontend dev
```

前端默认连接：

```bash
http://127.0.0.1:3000/api
```

如需覆盖，可在 `frontend/.env` 中配置：

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api
```

## 当前说明

- 前端当前默认使用真实 HTTP API
- 网站用户模块目前仍为占位摘要接口
- 服务器 RCON 校验当前仍为后端模拟逻辑
- 白名单申请/审核、社区服管理、封禁管理、管理员资料、操作日志均已接入 MySQL
- 后端开发环境默认使用 `192.168.0.62:3306/text`
