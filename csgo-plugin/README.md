# KZ Guard SourceMod 插件

该目录现在包含：
- `kzguard_presence.sp`：SourceMod 1.11 插件源码
- `kzguard_presence.smx`：编译后的插件文件
- `sourcemod-1.11.0-git6970-linux/`：你提供的 SourceMod 1.11 编译环境

## 功能
- 周期性把当前服务器在线玩家上报到 `KZ Guard` Rust 后端 API
- 上报字段包含：玩家昵称、SteamID、SteamID64、SteamID3、IP、连接时长、Ping、Source `userid`
- 提供两个 RCON 可调用的服务端命令：
  - `kzguard_kick_userid <userid> <reason>`
  - `kzguard_ban_userid <userid> <steam|ip> <seconds> <reason>`

## 运行依赖
SourceMod 1.11 本体**不自带 HTTP 客户端**，此插件编译时使用了本目录补充的 `steamworks.inc` 声明。
服务器运行时仍然需要额外安装 `SteamWorks` 扩展，否则玩家上报请求无法发出。

## 配置项
插件首次运行会自动生成 `cfg/sourcemod/kzguard.cfg`，后续直接修改这个文件即可，无需重新改源码。其中核心配置为：
- `kzguard_api_url`：首次生成时默认为空，请在 `cfg/sourcemod/kzguard.cfg` 中填写，例如 `http://192.168.0.132:3000/api/internal/server-presence/report`
- `kzguard_server_id`：网站后台该服务器的 `serverId`
- `kzguard_server_rcon_password`：后台保存的该服务器 RCON 密码
- `kzguard_report_interval`：上报间隔，默认 `15` 秒

## 安装
将编译好的 `kzguard_presence.smx` 放到服务器的 `addons/sourcemod/plugins/` 目录，然后：
1. 安装并启用 `SteamWorks` 扩展
2. 可直接使用当前目录下的 `csgo-plugin/kzguard.cfg` 作为模板，复制后填好 `cfg/sourcemod/kzguard.cfg`
3. 重启地图或重启服务器

## 编译命令
在本仓库中可直接使用：

```bash
csgo-plugin/sourcemod-1.11.0-git6970-linux/addons/sourcemod/scripting/spcomp \
  csgo-plugin/kzguard_presence.sp \
  -i csgo-plugin/sourcemod-1.11.0-git6970-linux/addons/sourcemod/scripting/include \
  -o csgo-plugin/kzguard_presence.smx
```
