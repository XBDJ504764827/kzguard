# KZ Guard

KZ Guard 是一个面向 **CS:GO / KZ 社区服** 的一体化管理平台，覆盖：

- 社区组与服务器管理
- 白名单申请、审核、公示与玩家限制
- 封禁管理与网站/游戏服同步
- SourceMod 插件在线玩家上报与进服校验
- 后台管理员权限控制与操作日志
- 公开白名单查询页、公开封禁公示页、公开白名单申请页

当前仓库采用 **前后端分离 + SourceMod 插件联动** 的结构，适合部署在已有 MySQL / Redis / CS:GO 游戏服环境的社区服场景。

## 功能概览

### 后台管理

- 社区组管理：创建、编辑、删除社区
- 游戏服务器管理：
  - 配置服务器 IP、端口、RCON
  - 验证 RCON 是否可用
  - 重置每台服务器独立的 `plugin_token`
  - 由系统管理员在网页中执行“重启服务器”
- 在线玩家管理：查看当前服务器在线玩家，并执行踢出 / 封禁
- 白名单管理：
  - 系统管理员可手动录入、编辑、删除白名单记录
  - 普通管理员只能审核玩家主动提交的白名单申请
  - 拒绝申请时必须填写原因
  - 已通过玩家可加入“玩家限制页”，单独设置允许进入的服务器
- 封禁管理：
  - 手动新增 / 编辑 / 删除 / 解除封禁
  - 支持游戏服内封禁同步到网站
  - 网站后台解除封禁时，可同步调用游戏服 `sm_unban`
- 网站管理员管理：
  - 系统管理员 / 普通管理员角色区分
- 操作日志：记录核心管理动作

### 玩家与公开页面

- 公开白名单申请页：
  - 支持输入 `SteamID64`、`SteamID`、`SteamID3` 或 Steam 个人资料链接
  - 支持自动查询玩家公开资料
  - 查询失败时支持 **完全离线兜底模式**，允许手动提交 `SteamID64`
- 公开白名单公示页：支持按 `SteamID64`、`SteamID`、昵称检索状态
- 公开封禁公示页：支持查询封禁记录

### 游戏服联动

- SourceMod 插件周期性上报在线玩家
- 插件可实时请求后端校验某个玩家是否允许进入服务器
- 插件可同步整服准入快照并写入本地缓存文件
- 后端不可用时，插件可回退到本地缓存进行兜底判断
- 游戏服内 `sm_ban` / `sm_unban` 可同步网站封禁管理

## 技术栈

| 层 | 技术 / 语言 | 说明 |
| --- | --- | --- |
| 前端 | TypeScript、React 18、Vite 7、React Router 6、Arco Design React | 管理后台与公开页面 |
| 后端 | Rust 2024、Axum 0.8、SQLx 0.8、Reqwest、Redis | HTTP API、鉴权、数据库、缓存、外部接口联动 |
| 数据库 | MySQL / MariaDB 兼容协议 | 存储社区、服务器、白名单、封禁、管理员、会话、日志 |
| 缓存 | Redis | 在线玩家状态、进服准入快照、外部资料缓存 |
| 游戏服插件 | SourcePawn / SourceMod 1.11 | 游戏内玩家上报、进服校验、封禁同步 |
| 前端包管理 | pnpm 10 | Monorepo 工作区管理 |

## 仓库结构

```text
kzguard/
├─ frontend/       # React + Vite 管理台与公开页面
├─ backend/        # Rust + Axum + SQLx 后端
├─ csgo-plugin/    # SourceMod 插件源码、编译产物、配置模板
├─ README.md       # 顶层说明文档
├─ package.json    # 根目录脚本
└─ pnpm-workspace.yaml
```

## 核心设计说明

### 1. 前后端分离

- `frontend` 只负责页面渲染与调用 API
- `backend` 只负责业务逻辑、数据库、Redis、插件内部接口
- 生产环境推荐使用同域部署，通过反向代理把 `/api` 转发到后端

### 2. Steam 标识统一以 SteamID64 为主

为了避免 `STEAM_1:X:Z` / `STEAM_0:X:Z` 在某些情况下出现歧义，系统当前以 **`SteamID64` 作为主标识**。同时仍兼容以下输入：

- `SteamID64`
- `SteamID`
- `SteamID3`
- Steam 社区资料链接

后端会尽量做统一解析与转换，插件也会直接上报 `SteamID64`。

### 3. 插件鉴权不复用 RCON 密码

每台网站中的服务器都会拥有一个独立的 `plugin_token`，插件访问内部接口时使用：

```http
X-Plugin-Token: <plugin_token>
```

这样可以避免直接使用 RCON 密码作为 API 鉴权凭据。

### 4. 服务器重启不再依赖 RCON `_restart`

系统管理员在网页点击“重启服务器”时，后端会执行该服务器配置的 **宿主机命令**。这意味着：

- 需要你在服务器设置中填写一个真正能“关服后再拉起”的命令
- 不能再依赖单纯的 RCON `_restart`
- 该命令在后端宿主机上通过 `sh -lc` 执行，因此必须做好权限与安全控制

## 运行环境要求

建议环境：

- Node.js 20+
- pnpm 10+
- Rust stable（支持 Edition 2024）
- MySQL 8+ 或兼容的 MariaDB
- Redis 6+
- 已安装 SourceMod 1.11 的 CS:GO 游戏服
- 游戏服安装 `SteamWorks` 扩展（插件 HTTP 请求依赖）

## 快速开始（开发环境）

### 1. 安装依赖

在仓库根目录执行：

```bash
pnpm install
```

### 2. 准备后端环境变量

复制模板：

```bash
cp backend/.env.example backend/.env
```

然后根据你的实际环境修改 `backend/.env`。

### 3. 准备前端环境变量

复制模板：

```bash
cp frontend/.env.example frontend/.env
```

如果前后端都跑在本机默认端口，通常只需要保持默认配置即可。

### 4. 启动后端

```bash
cargo run --manifest-path backend/Cargo.toml
```

默认监听：

- `http://0.0.0.0:3000`
- 健康检查：`http://127.0.0.1:3000/api/health`

### 5. 启动前端

```bash
pnpm --filter frontend dev
```

默认前端开发地址：

- `http://127.0.0.1:5173`

## 根目录常用命令

```bash
pnpm dev                # 启动前端开发服务器
pnpm dev:frontend       # 同上
pnpm dev:backend        # 启动 Rust 后端
pnpm build:frontend     # 构建前端
pnpm build:backend      # 构建后端
pnpm check:backend      # 后端编译检查
pnpm build              # 构建前端 + 后端
pnpm preview            # 预览前端构建产物
```

## 配置说明

### 后端配置：`backend/.env`

示例：

```env
HOST=0.0.0.0
PORT=3000

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=kzguard
MYSQL_PASSWORD=change_me
MYSQL_DATABASE=kzguard

REDIS_URL=redis://127.0.0.1:6379/
REDIS_PLAYER_PRESENCE_TTL_SECONDS=90

DEFAULT_ADMIN_USERNAME=root_admin
DEFAULT_ADMIN_PASSWORD=Admin@123
DEFAULT_ADMIN_DISPLAY_NAME=主系统管理员
DEFAULT_ADMIN_EMAIL=root@example.com
DEFAULT_ADMIN_NOTE=首次运行自动创建的默认系统管理员账号

GOKZ_API_BASE_URL=https://api.gokz.top/api/v1
STEAM_WEB_API_KEY=
STEAM_LEVEL_API_BASE_URL=https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/
STEAM_LEVEL_API_FALLBACK_BASE_URL=
PLAYER_PROFILE_STALE_SECONDS=21600
```

关键字段说明：

| 变量 | 说明 |
| --- | --- |
| `HOST` / `PORT` | 后端 HTTP 服务监听地址 |
| `MYSQL_*` | MySQL 连接配置 |
| `REDIS_URL` | Redis 连接串 |
| `REDIS_PLAYER_PRESENCE_TTL_SECONDS` | 在线玩家快照缓存 TTL |
| `DEFAULT_ADMIN_*` | 首次启动自动创建的默认系统管理员 |
| `GOKZ_API_BASE_URL` | GOKZ Rating 查询接口基础地址 |
| `STEAM_WEB_API_KEY` | Steam Web API Key，用于查询玩家公开资料 |
| `STEAM_LEVEL_API_BASE_URL` | Steam 等级主接口 |
| `STEAM_LEVEL_API_FALLBACK_BASE_URL` | Steam 等级备用接口 |
| `PLAYER_PROFILE_STALE_SECONDS` | 玩家资料缓存刷新周期 |

### 后端首次启动会做什么

后端启动时会自动：

- 创建数据库（如果不存在）
- 创建所需表结构（如果不存在）
- 检查并补齐部分历史字段
- 为缺失 `plugin_token` 的服务器补发 token
- 尝试补齐白名单玩家的 `SteamID64` / `SteamID3`
- 如果系统里还没有管理员，则自动创建默认系统管理员账号

因此，**生产环境第一次启动前务必先修改默认管理员密码**。

### 关于 `STEAM_WEB_API_KEY`

如果你希望公开白名单申请页更稳定地自动查询 Steam 玩家信息，建议配置：

- `STEAM_WEB_API_KEY`

未配置时：

- 自动查询功能可能受限
- 公开申请页仍可通过“离线兜底模式”手动提交 `SteamID64`

### 前端配置：`frontend/.env`

开发环境模板：

```env
VITE_API_MODE=http
VITE_API_BASE_URL=
```

生产环境模板：

```env
VITE_API_MODE=https
VITE_API_BASE_URL=/api
```

实际生效的关键变量是：

- `VITE_API_BASE_URL`

说明：

- 为空时，前端会默认请求 `http://当前域名主机:3000/api`
- 生产环境推荐设置为 `/api`，再由 Nginx / Caddy 反向代理到后端
- `VITE_API_MODE` 目前主要是历史占位字段，当前代码实际以 `VITE_API_BASE_URL` 为准

### SourceMod 插件配置：`cfg/sourcemod/kzguard.cfg`

插件首次运行会自动生成共享配置文件：

```text
cfg/sourcemod/kzguard.cfg
```

仓库中也提供了模板：`csgo-plugin/kzguard.cfg`

示例：

```kv
"KZGuard"
{
    "global"
    {
        "api_base_url"          "https://your-domain.example.com"
        "report_interval"       "15"
        "access_sync_interval"  "60"
        "access_cache_file"     "data/kzguard_access_cache.kv"
    }

    "instances"
    {
        "27015"
        {
            "server_id"     "server_xxx"
            "plugin_token"  "pt_xxx"
        }

        "27016"
        {
            "server_id"     "server_yyy"
            "plugin_token"  "pt_yyy"
        }
    }
}
```

字段说明：

| 节点 / 字段 | 说明 |
| --- | --- |
| `global.api_base_url` | 后端站点根地址，例如 `https://example.com` |
| `global.report_interval` | 在线玩家上报间隔（秒） |
| `global.access_sync_interval` | 整服准入快照同步间隔（秒） |
| `global.access_cache_file` | 本地缓存文件路径（相对 SourceMod `data/`） |
| `instances.<port>.server_id` | 后台中该服务器的 `server_id` |
| `instances.<port>.plugin_token` | 后台中该服务器的 `plugin_token` |

注意：

- `instances` 以 **游戏服端口号** 作为分组键
- 同一台宿主机多服可以共用一份配置文件
- 只有“同一台机器上的多个游戏服实例”适合这样配置
- 如果你把不同环境、不同站点的配置混在同一个文件里，仍应确保端口映射不会冲突

## 构建说明

### 构建前端

```bash
pnpm --filter frontend build
```

产物目录：

- `frontend/dist`

### 构建后端

```bash
cargo build --manifest-path backend/Cargo.toml --release
```

二进制位置：

- `backend/target/release/kzguard-backend`

### 编译 SourceMod 插件

仓库已附带你当前使用的 SourceMod 1.11 编译环境，可直接执行：

```bash
csgo-plugin/sourcemod-1.11.0-git6970-linux/addons/sourcemod/scripting/spcomp \
  csgo-plugin/kzguard_presence.sp \
  -i csgo-plugin/sourcemod-1.11.0-git6970-linux/addons/sourcemod/scripting/include \
  -o csgo-plugin/kzguard_presence.smx
```

## 生产部署建议

推荐的生产部署拓扑：

```text
浏览器
  └─ Nginx / Caddy
      ├─ /        -> frontend/dist 静态文件
      └─ /api     -> Rust backend (127.0.0.1:3000)

Rust backend
  ├─ MySQL
  └─ Redis

CS:GO Server + SourceMod + SteamWorks
  └─ 调用 /api/internal/* 接口
```

### 1. 构建生产产物

```bash
pnpm install
pnpm --filter frontend build
cargo build --manifest-path backend/Cargo.toml --release
```

### 2. 部署前端静态文件

将 `frontend/dist` 部署到你的静态站点目录，例如：

```bash
/usr/share/nginx/html/kzguard
```

### 3. 部署后端二进制

将以下内容放到服务器：

- `backend/target/release/kzguard-backend`
- `backend/.env`

例如目录：

```text
/opt/kzguard/
├─ kzguard-backend
└─ .env
```

### 4. 使用 systemd 管理后端（推荐）

下面是一个可参考的 `systemd` 示例：

```ini
[Unit]
Description=KZ Guard Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/kzguard
ExecStart=/opt/kzguard/kzguard-backend
EnvironmentFile=/opt/kzguard/.env
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

加载并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable kzguard
sudo systemctl start kzguard
sudo systemctl status kzguard
```

### 5. Nginx 反向代理示例

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    root /usr/share/nginx/html/kzguard;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果你使用 HTTPS，请再配合证书与 443 监听。

## 游戏服插件部署流程

### 1. 安装插件文件

把 `csgo-plugin/kzguard_presence.smx` 放到：

```text
addons/sourcemod/plugins/
```

### 2. 安装 `SteamWorks` 扩展

该插件运行期需要 `SteamWorks` 扩展来发起 HTTP 请求。没有这个扩展时：

- 在线玩家上报不可用
- 实时进服校验不可用
- 准入快照同步不可用

### 3. 让插件自动生成配置文件

先启动一次服务器，插件会自动生成：

```text
cfg/sourcemod/kzguard.cfg
```

### 4. 在后台创建服务器并拿到标识

在网页后台完成：

- 创建社区
- 新建服务器
- 验证 RCON
- 记录该服务器的：
  - `server_id`
  - `plugin_token`

### 5. 填写 `kzguard.cfg`

在 `instances.<端口>` 中填入上一步拿到的：

- `server_id`
- `plugin_token`

### 6. 重启地图或重启服务器

使配置生效。

## 使用说明

### 首次登录

如果数据库中还没有管理员，后端首次启动会自动创建默认系统管理员：

- 用户名：`root_admin`
- 密码：`Admin@123`

**请在首次登录后立刻修改密码，并新增正式管理员账号。**

### 推荐初始化顺序

1. 启动 MySQL 与 Redis
2. 启动后端
3. 部署前端并确认 `/api/health` 正常
4. 使用默认系统管理员登录后台
5. 新增社区
6. 新增服务器并验证 RCON
7. 把 `server_id` 与 `plugin_token` 写入插件配置
8. 在游戏服安装 / 启动插件
9. 测试在线玩家上报与进服校验
10. 再向玩家开放白名单申请入口

### 白名单工作流

- 玩家访问公开申请页提交申请
- 普通管理员或系统管理员可审核申请
- 普通管理员：
  - 只能审核主动申请
  - 驳回时必须填写原因
- 系统管理员：
  - 可手动添加、编辑、删除白名单
  - 可把已通过玩家加入“玩家限制页”
  - 可为限制页中的玩家单独配置允许进入的服务器

### 封禁工作流

- 后台可手动新增封禁记录
- 后台可对在线玩家执行封禁
- 游戏服内 `sm_ban` / `sm_unban` 会同步网站封禁管理
- 后台解除封禁时，会尝试同步游戏服执行解封

### 进服校验规则

当前支持以下组合：

- 仅开启白名单：只有白名单玩家可进入
- 仅开启进服验证：玩家需同时满足最低 `rating` 与最低 `Steam 等级`
- 同时开启白名单与进服验证：
  - 白名单玩家优先放行
  - 非白名单玩家仍需满足进服验证门槛
- 玩家限制页：
  - 若某位已通过白名单的玩家被加入限制页
  - 则该玩家只能进入被允许的服务器列表

## 后端 API 概览

### 网站后台接口

- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/communities`
- `POST /api/communities`
- `PATCH /api/communities/{community_id}`
- `DELETE /api/communities/{community_id}`
- `POST /api/communities/{community_id}/servers/verify-rcon`
- `POST /api/communities/{community_id}/servers`
- `PATCH /api/communities/{community_id}/servers/{server_id}`
- `POST /api/communities/{community_id}/servers/{server_id}/plugin-token/reset`
- `POST /api/communities/{community_id}/servers/{server_id}/restart`
- `GET /api/whitelist`
- `GET /api/whitelist/restrictions`
- `POST /api/whitelist/manual`
- `PATCH /api/whitelist/{player_id}`
- `DELETE /api/whitelist/{player_id}`
- `POST /api/whitelist/{player_id}/restriction`
- `PATCH /api/whitelist/{player_id}/restriction`
- `DELETE /api/whitelist/{player_id}/restriction`
- `PATCH /api/whitelist/{player_id}/status`
- `GET /api/bans`
- `POST /api/bans/manual`
- `PATCH /api/bans/{ban_id}`
- `POST /api/bans/{ban_id}/revoke`
- `DELETE /api/bans/{ban_id}`
- `GET /api/admins`
- `POST /api/admins`
- `PATCH /api/admins/{admin_id}`
- `GET /api/operation-logs`

### 公开接口

- `GET /api/public/steam/resolve`
- `GET /api/public/whitelist/history`
- `GET /api/public/whitelist`
- `POST /api/public/whitelist/applications`
- `GET /api/public/bans`

### 插件内部接口

请求头必须携带：

```http
X-Plugin-Token: <plugin_token>
```

接口包括：

- `POST /api/internal/server-presence/report`
- `GET /api/internal/server-access/check?serverId=...&steamId64=...`
- `GET /api/internal/server-access/sync?serverId=...`
- `POST /api/internal/server-bans`
- `POST /api/internal/server-bans/revoke`

## 权限模型

### 系统管理员

可以：

- 管理社区与服务器
- 管理网站管理员
- 手动录入 / 编辑 / 删除白名单
- 审核白名单申请
- 管理封禁
- 重置服务器 `plugin_token`
- 重启游戏服务器
- 管理玩家限制页
- 查看操作日志

### 普通管理员

可以：

- 审核玩家主动提交的白名单申请
- 查看白名单、封禁、公示数据
- 执行允许范围内的后台查看操作

不可以：

- 手动添加 / 编辑 / 删除白名单
- 管理玩家限制页
- 重启服务器
- 管理系统管理员数据

## 常见问题

### 1. 公开白名单申请页查询玩家信息失败，显示 502 / Bad Gateway

通常是上游 Steam 接口不可用、超时或密钥问题。处理方式：

- 检查 `STEAM_WEB_API_KEY` 是否已正确配置
- 检查后端服务器是否能访问 Steam Web API
- 玩家仍可使用离线兜底模式，手动填写 `SteamID64`

### 2. 插件日志提示“进服校验响应体读取失败，改用本地缓存”

说明插件实时请求后端失败，已自动回退到本地缓存。建议检查：

- `api_base_url` 是否正确
- `plugin_token` 是否匹配后台服务器配置
- 目标游戏服所在机器是否能访问后端
- `SteamWorks` 扩展是否正常安装

### 3. 网页点击重启服务器只关服不拉起

当前系统已经禁用 RCON `_restart` 方案。你必须在服务器设置里填写一个真正能 **重新拉起游戏服进程** 的宿主机命令，例如：

```bash
systemctl restart csgo-27015
```

或你自己的启动脚本。

### 4. 为什么推荐优先使用 SteamID64

因为 `SteamID` 在部分场景下可能出现不同表示形式，而 `SteamID64` 更稳定，适合作为系统主键与跨系统匹配标识。

## 安全建议

- **务必修改默认系统管理员密码**
- 不要把 `backend/.env`、真实数据库密码、`STEAM_WEB_API_KEY` 提交到 GitHub
- 不要把生产环境的 `plugin_token` 暴露给无关人员
- 生产环境建议启用 HTTPS
- 推荐通过反向代理统一入口，避免把后端端口直接暴露公网
- `restart_command` 会在宿主机上执行，请严格控制后端进程权限

## 当前已知特点 / 限制

- 后端当前不会直接托管前端静态文件，生产环境建议使用 Nginx / Caddy 部署前端
- 前端当前实际以 `VITE_API_BASE_URL` 决定 API 地址
- SourceMod 插件依赖 `SteamWorks` 扩展
- 仓库当前未内置 Docker / docker-compose / k8s 部署模板，部署方式以二进制 + 静态文件为主

## 子项目文档

- `backend/README.md`
- `csgo-plugin/README.md`

如果你准备把这个仓库公开到 GitHub，建议同时补充：

- 项目截图
- 版本发布日志（Release Notes）
- LICENSE
- 贡献指南（CONTRIBUTING）
- Issue / PR 模板

## License

当前仓库未附带许可证文件。如需开源发布，建议在公开前补充合适的 `LICENSE`。
