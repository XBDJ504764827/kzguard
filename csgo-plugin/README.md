# KZ Guard SourceMod 插件

该目录现在包含：
- `kzguard_presence.sp`：SourceMod 1.11 插件源码
- `kzguard_presence.smx`：编译后的插件文件
- `kzguard.cfg`：共享配置模板
- `sourcemod-1.11.0-git6970-linux/`：你提供的 SourceMod 1.11 编译环境

## 功能
- 周期性把当前服务器在线玩家上报到 `KZ Guard` Rust 后端 API
- 周期性从后端同步当前服务器的准入快照，并合并进共享缓存文件
- 玩家进入服务器时优先请求后端实时校验；若实时校验失败，则回退到共享缓存文件中的当前服务器分区
- 支持“一机多服，共享一个配置文件”
- 支持“一机多服，共享一个缓存文件，但按服务器实例分区读写”
- 内部 API 鉴权改为 `plugin_token`，不再复用游戏服 `RCON` 密码
- 上报字段包含：玩家昵称、SteamID、SteamID64、SteamID3、IP、连接时长、Ping、Source `userid`
- 提供两个 RCON 可调用的服务端命令：
  - `kzguard_kick_userid <userid> <reason>`
  - `kzguard_ban_userid <userid> <steam|ip> <seconds> <reason>`
- 提供两个游戏内管理员命令（聊天可直接使用 `!ban` / `!unban`）：
  - `sm_ban <#userid|name> <minutes|0> <reason>`
  - `sm_unban <steamid|steamid64|steamid3|ip>`
- 游戏内 `!ban` / `!unban` 会先执行本地封禁或解封，再同步到网站封禁管理

## 准入逻辑
- 仅开启白名单：只有白名单玩家可进入
- 仅开启进服验证：只有同时满足最低 `rating` 和最低 `Steam 等级` 的玩家可进入
- 同时开启白名单与进服验证：白名单玩家优先放行；非白名单玩家仍需满足进服验证门槛

## 共享配置文件
插件首次运行会自动生成 `cfg/sourcemod/kzguard.cfg`。

该文件采用 `KeyValues` 结构，分为两部分：
- `global`：整台机器共享的配置，推荐只填写一次 `api_base_url`，其余内部接口地址由插件自动派生
- `instances`：按游戏服端口区分的实例配置，每个端口单独填写：
  - `server_id`
  - `plugin_token`

示例见 `csgo-plugin/kzguard.cfg`。

兼容说明：
- 推荐新写法：只配置 `api_base_url`
- 旧写法仍兼容：如果你保留 `api_url`、`access_check_url`、`access_sync_url`、`ban_sync_url`、`unban_sync_url` 中的任意一个或多个，插件仍可继续工作
- 若只填写了旧版 `api_url`（在线玩家上报地址），插件也会自动推导其他内部接口地址

## 共享缓存文件
默认共享缓存文件是：
- `addons/sourcemod/data/kzguard_access_cache.kv`

这个文件是整台机器共享的，但内部会按 `serverId` 分区存储：
- 每个游戏服实例只会读取自己的服务器分区
- 每次同步时只会更新自己的服务器分区

这样可以满足：
- 一台机器多个游戏服共用一个缓存文件
- 不同服务器的白名单 / 进服验证规则互不串服

## 鉴权方式
插件访问以下内部接口时，会在请求头里带上：
- `X-Plugin-Token: <当前服务器实例对应的 plugin_token>`

接口包括：
- 在线玩家上报
- 实时进服校验
- 准入快照同步
- 游戏内封禁同步
- 游戏内解封同步

## 运行依赖
SourceMod 1.11 本体**不自带 HTTP 客户端**，此插件编译时使用了本目录补充的 `steamworks.inc` 声明。
服务器运行时仍然需要额外安装 `SteamWorks` 扩展，否则玩家上报、实时校验与准入缓存同步请求都无法发出。

## 安装
将编译好的 `kzguard_presence.smx` 放到服务器的 `addons/sourcemod/plugins/` 目录，然后：
1. 安装并启用 `SteamWorks` 扩展
2. 启动一次服务器，让插件自动生成 `cfg/sourcemod/kzguard.cfg`
3. 在 `global` 中填写一次 `api_base_url`，例如 `http://192.168.0.132:3000`
4. 按端口补齐 `instances` 中的 `server_id` 和 `plugin_token`
5. 重启地图或重启服务器

## 编译命令
在本仓库中可直接使用：

```bash
csgo-plugin/sourcemod-1.11.0-git6970-linux/addons/sourcemod/scripting/spcomp   csgo-plugin/kzguard_presence.sp   -i csgo-plugin/sourcemod-1.11.0-git6970-linux/addons/sourcemod/scripting/include   -o csgo-plugin/kzguard_presence.smx
```
