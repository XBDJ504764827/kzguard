# KZ Guard

KZ Guard 是一个面向 CSGO 社区服的管理平台，当前仓库已经按三端拆分：

- `frontend`：React + Vite + Arco Design React 管理台前端
- `backend`：后端服务占位目录，待开发
- `csgo-plugin`：CSGO 插件占位目录，待开发

## 当前已完成

- 社区组管理页面
- 白名单管理页面
- 黑白主题切换
- 基于 `localStorage` 的前端原型数据持久化

## 使用方式

```bash
pnpm install
pnpm dev
```

## 当前说明

- 目前仅实现前端原型与交互流程
- 服务器 RCON 校验为前端模拟校验
- 白名单申请/审核流程为前端本地状态流转
