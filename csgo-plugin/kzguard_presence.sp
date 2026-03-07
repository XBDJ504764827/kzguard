#pragma semicolon 1
#pragma newdecls required

#include <sourcemod>
#include <sdktools>
#include <banning>
#include <steamworks>

public Plugin myinfo =
{
	name = "KZ Guard Presence",
	author = "wqq",
	description = "Reports live CS:GO players to KZ Guard with shared config/cache and plugin_token auth",
	version = "0.4.0",
	url = ""
};

char g_ApiUrl[256];
char g_AccessCheckUrl[256];
char g_AccessSyncUrl[256];
char g_BanSyncUrl[256];
char g_UnbanSyncUrl[256];
char g_ServerId[128];
char g_PluginToken[192];
char g_AccessCacheFile[PLATFORM_MAX_PATH];
char g_InstancePort[16];
float g_ReportInterval = 15.0;
float g_AccessSyncInterval = 60.0;
Handle g_ReportTimer = null;
Handle g_AccessSyncTimer = null;
bool g_ReportInFlight = false;
bool g_AccessSyncInFlight = false;
bool g_ClientAccessCheckInFlight[MAXPLAYERS + 1];
StringMap g_RequestUserIds;
KeyValues g_LocalAccessKv = null;
bool g_LocalAccessLoaded = false;

public void OnPluginStart()
{
	RegServerCmd("kzguard_kick_userid", Command_KickUserId, "KZ Guard 按 userid 踢出玩家");
	RegServerCmd("kzguard_ban_userid", Command_BanUserId, "KZ Guard 按 userid 封禁玩家");
	RegAdminCmd("sm_ban", Command_AdminBan, ADMFLAG_BAN, "sm_ban <#userid|name> <minutes|0> <reason>");
	RegAdminCmd("sm_unban", Command_AdminUnban, ADMFLAG_UNBAN, "sm_unban <steamid|steamid64|steamid3|ip>");

	g_RequestUserIds = new StringMap();
	EnsureConfigTemplateExists();
	LoadRuntimeConfiguration();
	LoadLocalAccessCache();
	ResetReportTimer();
	ResetAccessSyncTimer();

	if (g_InstancePort[0] != '\0')
	{
		PrintToServer("[KZ Guard] 已加载共享配置文件 cfg/sourcemod/kzguard.cfg，当前实例端口：%s", g_InstancePort);
	}
	else
	{
		PrintToServer("[KZ Guard] 已加载共享配置文件 cfg/sourcemod/kzguard.cfg，但暂未识别当前游戏服端口。");
	}
}

public void OnConfigsExecuted()
{
	LoadRuntimeConfiguration();
	LoadLocalAccessCache();
	ResetReportTimer();
	ResetAccessSyncTimer();
	QueuePresenceReport(2.0);
	QueueAccessSync(3.0);
}

public void OnMapStart()
{
	LoadRuntimeConfiguration();
	LoadLocalAccessCache();
	QueuePresenceReport(2.0);
	QueueAccessSync(3.0);
}

public void OnClientPostAdminCheck(int client)
{
	if (!IsFakeClient(client))
	{
		QueueClientAccessCheck(client, 1.0);
		QueuePresenceReport(2.0);
	}
}

public void OnClientDisconnect_Post(int client)
{
	if (!IsFakeClient(client))
	{
		g_ClientAccessCheckInFlight[client] = false;
		QueuePresenceReport(1.0);
	}
}

public Action Command_KickUserId(int args)
{
	if (args < 2)
	{
		LogError("[KZ Guard] kzguard_kick_userid <userid> <reason>");
		return Plugin_Handled;
	}

	char userIdArg[16];
	GetCmdArg(1, userIdArg, sizeof(userIdArg));
	int userId = StringToInt(userIdArg);
	int client = GetClientOfUserId(userId);

	if (client <= 0 || !IsClientInGame(client))
	{
		LogError("[KZ Guard] 无法踢出 userid=%d，对应玩家已离线", userId);
		return Plugin_Handled;
	}

	char reason[192];
	GetCmdArg(2, reason, sizeof(reason));
	TrimString(reason);
	if (reason[0] == '\0')
	{
		strcopy(reason, sizeof(reason), "KZ Guard 管理后台踢出");
	}

	KickClient(client, "%s", reason);
	QueuePresenceReport(1.0);
	return Plugin_Handled;
}

public Action Command_BanUserId(int args)
{
	if (args < 4)
	{
		LogError("[KZ Guard] kzguard_ban_userid <userid> <steam|ip> <seconds> <reason>");
		return Plugin_Handled;
	}

	char userIdArg[16];
	char banMode[16];
	char durationArg[16];
	char reason[192];

	GetCmdArg(1, userIdArg, sizeof(userIdArg));
	GetCmdArg(2, banMode, sizeof(banMode));
	GetCmdArg(3, durationArg, sizeof(durationArg));
	GetCmdArg(4, reason, sizeof(reason));
	TrimString(reason);

	int userId = StringToInt(userIdArg);
	int client = GetClientOfUserId(userId);
	if (client <= 0 || !IsClientInGame(client))
	{
		LogError("[KZ Guard] 无法封禁 userid=%d，对应玩家已离线", userId);
		return Plugin_Handled;
	}

	int durationSeconds = StringToInt(durationArg);
	if (durationSeconds < 0)
	{
		durationSeconds = 0;
	}

	int durationMinutes = 0;
	if (durationSeconds > 0)
	{
		durationMinutes = RoundToCeil(float(durationSeconds) / 60.0);
	}

	int flags = StrEqual(banMode, "ip", false) ? BANFLAG_IP : BANFLAG_AUTHID;
	if (reason[0] == '\0')
	{
		strcopy(reason, sizeof(reason), "KZ Guard 管理后台封禁");
	}

	if (!BanClient(client, durationMinutes, flags, reason, reason, "kzguard", 0))
	{
		LogError("[KZ Guard] BanClient 执行失败，userid=%d", userId);
		return Plugin_Handled;
	}

	QueuePresenceReport(1.0);
	return Plugin_Handled;
}


public Action Command_AdminBan(int client, int args)
{
	if (args < 3)
	{
		ReplyToCommand(client, "[KZ Guard] 用法: sm_ban <#userid|name> <minutes|0> <reason>");
		return Plugin_Handled;
	}

	char arguments[256];
	char targetArg[64];
	char durationArg[32];
	GetCmdArgString(arguments, sizeof(arguments));

	int len = BreakString(arguments, targetArg, sizeof(targetArg));
	if (len == -1)
	{
		ReplyToCommand(client, "[KZ Guard] 用法: sm_ban <#userid|name> <minutes|0> <reason>");
		return Plugin_Handled;
	}

	int nextLen = BreakString(arguments[len], durationArg, sizeof(durationArg));
	if (nextLen == -1)
	{
		ReplyToCommand(client, "[KZ Guard] 用法: sm_ban <#userid|name> <minutes|0> <reason>");
		return Plugin_Handled;
	}
	len += nextLen;

	char reason[192];
	strcopy(reason, sizeof(reason), arguments[len]);
	TrimString(reason);
	if (reason[0] == '\0')
	{
		ReplyToCommand(client, "[KZ Guard] 封禁玩家时必须填写理由。");
		return Plugin_Handled;
	}

	int targetList[1];
	char targetName[MAX_TARGET_LENGTH];
	bool tnIsMl;
	int matchCount = ProcessTargetString(
		targetArg,
		client,
		targetList,
		1,
		COMMAND_FILTER_CONNECTED | COMMAND_FILTER_NO_MULTI | COMMAND_FILTER_NO_BOTS,
		targetName,
		sizeof(targetName),
		tnIsMl
	);
	if (matchCount <= 0)
	{
		ReplyToTargetError(client, matchCount);
		return Plugin_Handled;
	}

	int target = targetList[0];
	char targetNickname[MAX_NAME_LENGTH];
	char targetSteamIdentifier[MAX_AUTHID_LENGTH];
	char targetIpAddress[64];
	if (!CaptureBanTargetSnapshot(
		target,
		targetNickname,
		sizeof(targetNickname),
		targetSteamIdentifier,
		sizeof(targetSteamIdentifier),
		targetIpAddress,
		sizeof(targetIpAddress)
	))
	{
		ReplyToCommand(client, "[KZ Guard] 无法读取目标玩家的 Steam 标识，已取消封禁。");
		return Plugin_Handled;
	}

	int durationMinutes = StringToInt(durationArg);
	if (durationMinutes < 0)
	{
		durationMinutes = 0;
	}

	if (!BanClient(target, durationMinutes, BANFLAG_AUTHID, reason, reason, "kzguard_sm_ban", client))
	{
		ReplyToCommand(client, "[KZ Guard] 本地封禁失败，请稍后重试。");
		return Plugin_Handled;
	}

	char operatorName[MAX_NAME_LENGTH];
	char operatorSteamIdentifier[MAX_AUTHID_LENGTH];
	GetCommandOperatorProfile(client, operatorName, sizeof(operatorName), operatorSteamIdentifier, sizeof(operatorSteamIdentifier));
	LogAction(
		client,
		-1,
		"\"%L\" banned \"%s\" (minutes \"%d\") (reason \"%s\")",
		client,
		targetNickname,
		durationMinutes,
		reason
	);

	if (HasBanSyncConfiguration())
	{
		SendBanSyncRequest(
			operatorName,
			operatorSteamIdentifier,
			targetNickname,
			targetSteamIdentifier,
			targetIpAddress,
			durationMinutes,
			reason
		);
		ReplyToCommand(client, "[KZ Guard] 已封禁 %s，正在同步网站封禁管理。", targetNickname);
	}
	else
	{
		ReplyToCommand(client, "[KZ Guard] 本地封禁已执行，但未配置网站封禁同步地址。");
	}

	QueuePresenceReport(1.0);
	return Plugin_Handled;
}

public Action Command_AdminUnban(int client, int args)
{
	if (args < 1)
	{
		ReplyToCommand(client, "[KZ Guard] 用法: sm_unban <steamid|steamid64|steamid3|ip>");
		return Plugin_Handled;
	}

	char identity[192];
	GetCmdArgString(identity, sizeof(identity));
	ReplaceString(identity, sizeof(identity), "\"", "");
	TrimString(identity);
	if (identity[0] == '\0')
	{
		ReplyToCommand(client, "[KZ Guard] 请输入要解封的 Steam 标识或 IP。");
		return Plugin_Handled;
	}

	int banFlags = IsLikelyIpAddress(identity) ? BANFLAG_IP : BANFLAG_AUTHID;
	if (!RemoveBan(identity, banFlags, "kzguard_sm_unban", client))
	{
		ReplyToCommand(client, "[KZ Guard] 本地解封失败，请检查输入是否正确。");
		return Plugin_Handled;
	}

	char operatorName[MAX_NAME_LENGTH];
	char operatorSteamIdentifier[MAX_AUTHID_LENGTH];
	GetCommandOperatorProfile(client, operatorName, sizeof(operatorName), operatorSteamIdentifier, sizeof(operatorSteamIdentifier));
	LogAction(client, -1, "\"%L\" removed ban (filter \"%s\")", client, identity);

	if (HasUnbanSyncConfiguration())
	{
		SendUnbanSyncRequest(operatorName, operatorSteamIdentifier, identity);
		ReplyToCommand(client, "[KZ Guard] 已解除封禁，正在同步网站封禁管理。");
	}
	else
	{
		ReplyToCommand(client, "[KZ Guard] 本地解封已执行，但未配置网站封禁同步地址。");
	}

	return Plugin_Handled;
}

public Action Timer_ReportPresence(Handle timer, any data)
{
	SendPresenceReport();
	return Plugin_Continue;
}

public Action Timer_AccessSync(Handle timer, any data)
{
	SendAccessSyncRequest();
	return Plugin_Continue;
}

public Action Timer_QueuedReport(Handle timer, any data)
{
	SendPresenceReport();
	return Plugin_Stop;
}

public Action Timer_QueuedAccessSync(Handle timer, any data)
{
	SendAccessSyncRequest();
	return Plugin_Stop;
}

public Action Timer_QueuedClientAccessCheck(Handle timer, any userId)
{
	int client = GetClientOfUserId(userId);
	if (client > 0 && IsClientInGame(client) && !IsFakeClient(client))
	{
		SendClientAccessCheck(client);
	}
	return Plugin_Stop;
}

public void OnPresenceReportCompleted(Handle request, bool failure, bool requestSuccessful, EHTTPStatusCode statusCode, any contextValue)
{
	g_ReportInFlight = false;
	int status = view_as<int>(statusCode);

	if (failure || !requestSuccessful || status < view_as<int>(k_EHTTPStatusCode200OK) || status >= 300)
	{
		LogError(
			"[KZ Guard] 在线玩家上报失败：failure=%d requestSuccessful=%d status=%d",
			failure,
			requestSuccessful,
			status
		);
	}

	delete request;
}

public void OnAccessSyncCompleted(Handle request, bool failure, bool requestSuccessful, EHTTPStatusCode statusCode, any contextValue)
{
	g_AccessSyncInFlight = false;
	int status = view_as<int>(statusCode);

	if (failure || !requestSuccessful || status < view_as<int>(k_EHTTPStatusCode200OK) || status >= 300)
	{
		LogError(
			"[KZ Guard] 准入缓存同步失败：failure=%d requestSuccessful=%d status=%d",
			failure,
			requestSuccessful,
			status
		);
		delete request;
		return;
	}

	char tempPath[PLATFORM_MAX_PATH];
	BuildAccessSyncTempFilePath(tempPath, sizeof(tempPath));
	if (!SteamWorks_WriteHTTPResponseBodyToFile(request, tempPath))
	{
		LogError("[KZ Guard] 写入临时准入快照失败：%s", tempPath);
		delete request;
		return;
	}

	if (!MergeSyncedSnapshotIntoSharedCache(tempPath))
	{
		LogError("[KZ Guard] 合并共享准入缓存失败：%s", tempPath);
	}

	DeleteFile(tempPath);

	if (!LoadLocalAccessCache())
	{
		LogError("[KZ Guard] 准入缓存同步成功，但重新加载共享缓存失败");
	}

	delete request;
}

public void OnBanSyncCompleted(Handle request, bool failure, bool requestSuccessful, EHTTPStatusCode statusCode, any contextValue)
{
	LogHttpSyncFailure("封禁记录同步", request, failure, requestSuccessful, statusCode);
	delete request;
}

public void OnUnbanSyncCompleted(Handle request, bool failure, bool requestSuccessful, EHTTPStatusCode statusCode, any contextValue)
{
	LogHttpSyncFailure("解封记录同步", request, failure, requestSuccessful, statusCode);
	delete request;
}

public void OnAccessCheckCompleted(Handle request, bool failure, bool requestSuccessful, EHTTPStatusCode statusCode, any contextValue)
{
	int userId = 0;
	TakeRequestUserId(request, userId);
	int client = GetClientOfUserId(userId);
	if (client > 0)
	{
		g_ClientAccessCheckInFlight[client] = false;
	}

	int status = view_as<int>(statusCode);
	if (client <= 0 || !IsClientInGame(client) || IsFakeClient(client))
	{
		delete request;
		return;
	}

	if (failure || !requestSuccessful || status < view_as<int>(k_EHTTPStatusCode200OK) || status >= 300)
	{
		LogError(
			"[KZ Guard] 进服校验接口失败，改用本地缓存：client=%N failure=%d requestSuccessful=%d status=%d",
			client,
			failure,
			requestSuccessful,
			status
		);
		HandleAccessCheckFallback(client);
		delete request;
		return;
	}

	char body[1024];
	if (!SteamWorks_GetHTTPResponseBodyData(request, body, sizeof(body)))
	{
		LogError("[KZ Guard] 进服校验响应体读取失败，改用本地缓存：client=%N", client);
		HandleAccessCheckFallback(client);
		delete request;
		return;
	}

	bool allow = true;
	char message[256];
	if (!ParseAccessCheckResponse(body, allow, message, sizeof(message)))
	{
		LogError("[KZ Guard] 进服校验响应解析失败，改用本地缓存：client=%N body=%s", client, body);
		HandleAccessCheckFallback(client);
		delete request;
		return;
	}

	if (!allow)
	{
		if (message[0] == '\0')
		{
			strcopy(message, sizeof(message), "你当前不满足服务器准入条件。");
		}
		KickClient(client, "%s", message);
		QueuePresenceReport(1.0);
	}

	delete request;
}

void ResetRuntimeConfiguration()
{
	g_ApiUrl[0] = '\0';
	g_AccessCheckUrl[0] = '\0';
	g_AccessSyncUrl[0] = '\0';
	g_BanSyncUrl[0] = '\0';
	g_UnbanSyncUrl[0] = '\0';
	g_ServerId[0] = '\0';
	g_PluginToken[0] = '\0';
	g_InstancePort[0] = '\0';
	strcopy(g_AccessCacheFile, sizeof(g_AccessCacheFile), "data/kzguard_access_cache.kv");
	g_ReportInterval = 15.0;
	g_AccessSyncInterval = 60.0;
}

bool ResolveCurrentInstancePort(char[] portBuffer, int maxlen)
{
	ConVar hostPort = FindConVar("hostport");
	if (hostPort == null)
	{
		hostPort = FindConVar("port");
	}

	if (hostPort == null)
	{
		LogError("[KZ Guard] 未找到 hostport/port ConVar，无法识别当前实例");
		portBuffer[0] = '\0';
		return false;
	}

	int port = hostPort.IntValue;
	if (port <= 0)
	{
		LogError("[KZ Guard] 当前实例端口无效：%d", port);
		portBuffer[0] = '\0';
		return false;
	}

	IntToString(port, portBuffer, maxlen);
	return true;
}

void BuildConfigFilePath(char[] path, int maxlen)
{
	BuildPath(Path_SM, path, maxlen, "../../cfg/sourcemod/kzguard.cfg");
}

void EnsureConfigTemplateExists()
{
	char configPath[PLATFORM_MAX_PATH];
	BuildConfigFilePath(configPath, sizeof(configPath));
	if (FileExists(configPath))
	{
		return;
	}

	File file = OpenFile(configPath, "w");
	if (file == null)
	{
		LogError("[KZ Guard] 无法生成共享配置模板：%s", configPath);
		return;
	}

	WriteFileLine(file, "\"KZGuard\"");
	WriteFileLine(file, "{");
	WriteFileLine(file, "	\"global\"");
	WriteFileLine(file, "	{");
	WriteFileLine(file, "		\"api_url\"\t\"http://192.168.0.132:3000/api/internal/server-presence/report\"");
	WriteFileLine(file, "		\"access_check_url\"\t\"http://192.168.0.132:3000/api/internal/server-access/check\"");
	WriteFileLine(file, "		\"access_sync_url\"\t\"http://192.168.0.132:3000/api/internal/server-access/sync\"");
	WriteFileLine(file, "		\"report_interval\"\t\"15\"");
	WriteFileLine(file, "		\"access_sync_interval\"\t\"60\"");
	WriteFileLine(file, "		\"access_cache_file\"\t\"data/kzguard_access_cache.kv\"");
	WriteFileLine(file, "	}");
	WriteFileLine(file, "");
	WriteFileLine(file, "	\"instances\"");
	WriteFileLine(file, "	{");
	WriteFileLine(file, "		\"27015\"");
	WriteFileLine(file, "		{");
	WriteFileLine(file, "			\"server_id\"\t\"server_xxx\"");
	WriteFileLine(file, "			\"plugin_token\"\t\"pt_xxx\"");
	WriteFileLine(file, "		}");
	WriteFileLine(file, "	}");
	WriteFileLine(file, "}");
	delete file;

	PrintToServer("[KZ Guard] 已自动生成共享配置模板：%s", configPath);
}

bool LoadRuntimeConfiguration()
{
	ResetRuntimeConfiguration();
	ResolveCurrentInstancePort(g_InstancePort, sizeof(g_InstancePort));

	char configPath[PLATFORM_MAX_PATH];
	BuildConfigFilePath(configPath, sizeof(configPath));
	if (!FileExists(configPath))
	{
		EnsureConfigTemplateExists();
		return false;
	}

	KeyValues kv = new KeyValues("KZGuard");
	if (!kv.ImportFromFile(configPath))
	{
		LogError("[KZ Guard] 共享配置文件读取失败：%s", configPath);
		delete kv;
		return false;
	}

	if (kv.JumpToKey("global", false))
	{
		kv.GetString("api_url", g_ApiUrl, sizeof(g_ApiUrl), "");
		kv.GetString("access_check_url", g_AccessCheckUrl, sizeof(g_AccessCheckUrl), "");
		kv.GetString("access_sync_url", g_AccessSyncUrl, sizeof(g_AccessSyncUrl), "");
		kv.GetString("ban_sync_url", g_BanSyncUrl, sizeof(g_BanSyncUrl), "");
		kv.GetString("unban_sync_url", g_UnbanSyncUrl, sizeof(g_UnbanSyncUrl), "");
		kv.GetString("access_cache_file", g_AccessCacheFile, sizeof(g_AccessCacheFile), "data/kzguard_access_cache.kv");

		int reportInterval = kv.GetNum("report_interval", 15);
		if (reportInterval < 5)
		{
			reportInterval = 5;
		}
		if (reportInterval > 120)
		{
			reportInterval = 120;
		}
		g_ReportInterval = float(reportInterval);

		int syncInterval = kv.GetNum("access_sync_interval", 60);
		if (syncInterval < 15)
		{
			syncInterval = 15;
		}
		if (syncInterval > 600)
		{
			syncInterval = 600;
		}
		g_AccessSyncInterval = float(syncInterval);
		kv.GoBack();
	}

	if (g_InstancePort[0] != '\0' && kv.JumpToKey("instances", false))
	{
		if (kv.JumpToKey(g_InstancePort, false))
		{
			kv.GetString("server_id", g_ServerId, sizeof(g_ServerId), "");
			kv.GetString("plugin_token", g_PluginToken, sizeof(g_PluginToken), "");
			kv.GoBack();
		}
		kv.GoBack();
	}

	delete kv;

	TrimString(g_ApiUrl);
	TrimString(g_AccessCheckUrl);
	TrimString(g_AccessSyncUrl);
	TrimString(g_BanSyncUrl);
	TrimString(g_UnbanSyncUrl);
	TrimString(g_ServerId);
	TrimString(g_PluginToken);
	TrimString(g_AccessCacheFile);

	if (g_AccessCacheFile[0] == '\0')
	{
		strcopy(g_AccessCacheFile, sizeof(g_AccessCacheFile), "data/kzguard_access_cache.kv");
	}

	PopulateDerivedInternalUrls();

	if (g_InstancePort[0] == '\0')
	{
		return false;
	}

	if (g_ServerId[0] == '\0' || g_PluginToken[0] == '\0')
	{
		PrintToServer("[KZ Guard] 未在共享配置中找到端口 %s 对应的实例配置，请补齐 server_id 与 plugin_token。", g_InstancePort);
		return false;
	}

	PrintToServer("[KZ Guard] 已读取实例配置：port=%s serverId=%s cache=%s", g_InstancePort, g_ServerId, g_AccessCacheFile);
	return true;
}

bool HasPresenceConfiguration()
{
	return g_ApiUrl[0] != '\0' && g_ServerId[0] != '\0' && g_PluginToken[0] != '\0';
}

bool HasAccessSyncConfiguration()
{
	return g_AccessSyncUrl[0] != '\0' && g_ServerId[0] != '\0' && g_PluginToken[0] != '\0';
}

bool HasAccessCheckConfiguration()
{
	return g_AccessCheckUrl[0] != '\0' && g_ServerId[0] != '\0' && g_PluginToken[0] != '\0';
}

bool HasBanSyncConfiguration()
{
	return g_BanSyncUrl[0] != '\0' && g_ServerId[0] != '\0' && g_PluginToken[0] != '\0';
}

bool HasUnbanSyncConfiguration()
{
	return g_UnbanSyncUrl[0] != '\0' && g_ServerId[0] != '\0' && g_PluginToken[0] != '\0';
}

void PopulateDerivedInternalUrls()
{
	if (g_BanSyncUrl[0] == '\0')
	{
		DeriveSiblingInternalUrl(g_ApiUrl, "/api/internal/server-bans", g_BanSyncUrl, sizeof(g_BanSyncUrl));
	}

	if (g_UnbanSyncUrl[0] == '\0')
	{
		DeriveSiblingInternalUrl(g_ApiUrl, "/api/internal/server-bans/revoke", g_UnbanSyncUrl, sizeof(g_UnbanSyncUrl));
	}
}

void DeriveSiblingInternalUrl(const char[] sourceUrl, const char[] nextPath, char[] output, int maxlen)
{
	output[0] = '\0';
	if (sourceUrl[0] == '\0')
	{
		return;
	}

	int marker = StrContains(sourceUrl, "/api/internal/");
	if (marker == -1)
	{
		return;
	}

	strcopy(output, maxlen, sourceUrl);
	output[marker] = '\0';
	StrCat(output, maxlen, nextPath);
}

void BuildAccessSyncTempFilePath(char[] path, int maxlen)
{
	if (g_InstancePort[0] == '\0')
	{
		BuildPath(Path_SM, path, maxlen, "data/kzguard_access_sync.tmp.kv");
		return;
	}

	BuildPath(Path_SM, path, maxlen, "data/kzguard_access_sync_%s.tmp.kv", g_InstancePort);
}

bool MergeSyncedSnapshotIntoSharedCache(const char[] snapshotPath)
{
	KeyValues source = new KeyValues("KZGuardAccess");
	if (!source.ImportFromFile(snapshotPath))
	{
		LogError("[KZ Guard] 无法读取同步下来的服务器准入快照：%s", snapshotPath);
		delete source;
		return false;
	}

	char cachePath[PLATFORM_MAX_PATH];
	BuildAccessCacheFilePath(cachePath, sizeof(cachePath));

	KeyValues shared = new KeyValues("KZGuardAccessCache");
	if (FileExists(cachePath) && !shared.ImportFromFile(cachePath))
	{
		LogError("[KZ Guard] 共享准入缓存文件读取失败，将尝试重建：%s", cachePath);
	}

	shared.Rewind();
	shared.SetString("schema", "shared-cache-v1");
	shared.SetString("lastWriterPort", g_InstancePort);
	if (!shared.JumpToKey("servers", true))
	{
		delete source;
		delete shared;
		return false;
	}
	if (!shared.JumpToKey(g_ServerId, true))
	{
		delete source;
		delete shared;
		return false;
	}

	CopySnapshotSection(source, shared);

	shared.Rewind();
	bool exported = shared.ExportToFile(cachePath);
	delete source;
	delete shared;

	if (!exported)
	{
		LogError("[KZ Guard] 共享准入缓存文件写入失败：%s", cachePath);
	}

	return exported;
}

void CopySnapshotSection(KeyValues source, KeyValues destination)
{
	CopyStringField(source, destination, "generatedAt");
	CopyStringField(source, destination, "serverId");
	CopyStringField(source, destination, "serverName");
	CopyStringField(source, destination, "communityName");
	destination.SetNum("whitelistEnabled", source.GetNum("whitelistEnabled", 0));
	destination.SetNum("entryVerificationEnabled", source.GetNum("entryVerificationEnabled", 0));
	destination.SetNum("minEntryRating", source.GetNum("minEntryRating", 0));
	destination.SetNum("minSteamLevel", source.GetNum("minSteamLevel", 0));

	if (destination.JumpToKey("players", false))
	{
		destination.DeleteThis();
	}

	if (!destination.JumpToKey("players", true))
	{
		return;
	}

	if (source.JumpToKey("players", false))
	{
		if (source.GotoFirstSubKey())
		{
			do
			{
				char playerKey[64];
				source.GetSectionName(playerKey, sizeof(playerKey));
				if (destination.JumpToKey(playerKey, true))
				{
					CopyPlayerSection(source, destination);
					destination.GoBack();
				}
			}
			while (source.GotoNextKey());
		}
		source.GoBack();
	}

	destination.GoBack();
}

void CopyPlayerSection(KeyValues source, KeyValues destination)
{
	CopyStringField(source, destination, "steamId64");
	CopyStringField(source, destination, "steamId");
	CopyStringField(source, destination, "steamId3");
	CopyStringField(source, destination, "nickname");
	CopyStringField(source, destination, "ipAddress");
	CopyStringField(source, destination, "rating");
	CopyStringField(source, destination, "steamLevel");
	destination.SetNum("isWhitelisted", source.GetNum("isWhitelisted", 0));
	destination.SetNum("meetsEntryVerification", source.GetNum("meetsEntryVerification", 0));
	destination.SetNum("canJoin", source.GetNum("canJoin", 0));
	CopyStringField(source, destination, "message");
	CopyStringField(source, destination, "refreshedAt");
}

void CopyStringField(KeyValues source, KeyValues destination, const char[] key)
{
	char value[1024];
	source.GetString(key, value, sizeof(value), "");
	destination.SetString(key, value);
}

void ResetReportTimer()
{
	if (g_ReportTimer != null)
	{
		KillTimer(g_ReportTimer);
		g_ReportTimer = null;
	}

	g_ReportTimer = CreateTimer(
		g_ReportInterval,
		Timer_ReportPresence,
		_,
		TIMER_REPEAT | TIMER_FLAG_NO_MAPCHANGE
	);
}

void ResetAccessSyncTimer()
{
	if (g_AccessSyncTimer != null)
	{
		KillTimer(g_AccessSyncTimer);
		g_AccessSyncTimer = null;
	}

	g_AccessSyncTimer = CreateTimer(
		g_AccessSyncInterval,
		Timer_AccessSync,
		_,
		TIMER_REPEAT | TIMER_FLAG_NO_MAPCHANGE
	);
}

void QueuePresenceReport(float delay)
{
	CreateTimer(delay, Timer_QueuedReport, _, TIMER_FLAG_NO_MAPCHANGE);
}

void QueueAccessSync(float delay)
{
	CreateTimer(delay, Timer_QueuedAccessSync, _, TIMER_FLAG_NO_MAPCHANGE);
}

void QueueClientAccessCheck(int client, float delay)
{
	CreateTimer(delay, Timer_QueuedClientAccessCheck, GetClientUserId(client), TIMER_FLAG_NO_MAPCHANGE);
}

void SendPresenceReport()
{
	if (g_ReportInFlight || !HasPresenceConfiguration())
	{
		return;
	}

	char payload[32768];
	BuildPresencePayload(payload, sizeof(payload), g_ServerId);

	Handle request = SteamWorks_CreateHTTPRequest(k_EHTTPMethodPOST, g_ApiUrl);
	if (request == null)
	{
		LogError("[KZ Guard] 创建在线玩家上报 HTTP 请求失败，请确认已安装 SteamWorks 扩展");
		return;
	}

	SteamWorks_SetHTTPRequestHeaderValue(request, "Content-Type", "application/json");
	SteamWorks_SetHTTPRequestHeaderValue(request, "X-Plugin-Token", g_PluginToken);
	SteamWorks_SetHTTPCallbacks(request, OnPresenceReportCompleted);
	SteamWorks_SetHTTPRequestRawPostBody(request, "application/json", payload, strlen(payload));

	g_ReportInFlight = true;
	if (!SteamWorks_SendHTTPRequest(request))
	{
		g_ReportInFlight = false;
		delete request;
		LogError("[KZ Guard] 发送在线玩家上报 HTTP 请求失败，请确认 SteamWorks 扩展工作正常");
	}
}

void SendAccessSyncRequest()
{
	if (g_AccessSyncInFlight || !HasAccessSyncConfiguration())
	{
		return;
	}

	char requestUrl[512];
	BuildSyncUrl(g_AccessSyncUrl, g_ServerId, requestUrl, sizeof(requestUrl));

	Handle request = SteamWorks_CreateHTTPRequest(k_EHTTPMethodGET, requestUrl);
	if (request == null)
	{
		LogError("[KZ Guard] 创建准入缓存同步 HTTP 请求失败，请确认已安装 SteamWorks 扩展");
		return;
	}

	SteamWorks_SetHTTPRequestHeaderValue(request, "X-Plugin-Token", g_PluginToken);
	SteamWorks_SetHTTPCallbacks(request, OnAccessSyncCompleted);

	g_AccessSyncInFlight = true;
	if (!SteamWorks_SendHTTPRequest(request))
	{
		g_AccessSyncInFlight = false;
		delete request;
		LogError("[KZ Guard] 发送准入缓存同步 HTTP 请求失败，请确认 SteamWorks 扩展工作正常");
	}
}

void SendClientAccessCheck(int client)
{
	if (!IsClientInGame(client) || IsFakeClient(client) || g_ClientAccessCheckInFlight[client])
	{
		return;
	}

	char steamId64[64];
	if (!GetClientAuthId(client, AuthId_SteamID64, steamId64, sizeof(steamId64), true))
	{
		LogError("[KZ Guard] 无法读取玩家 SteamID64，跳过进服校验：client=%N", client);
		return;
	}

	if (!HasAccessCheckConfiguration())
	{
		HandleAccessCheckFallback(client);
		return;
	}

	char requestUrl[512];
	BuildAccessCheckUrl(g_AccessCheckUrl, g_ServerId, steamId64, requestUrl, sizeof(requestUrl));

	Handle request = SteamWorks_CreateHTTPRequest(k_EHTTPMethodGET, requestUrl);
	if (request == null)
	{
		LogError("[KZ Guard] 创建进服校验 HTTP 请求失败，改用本地缓存：client=%N", client);
		HandleAccessCheckFallback(client);
		return;
	}

	StoreRequestUserId(request, GetClientUserId(client));
	SteamWorks_SetHTTPRequestHeaderValue(request, "X-Plugin-Token", g_PluginToken);
	SteamWorks_SetHTTPCallbacks(request, OnAccessCheckCompleted);
	g_ClientAccessCheckInFlight[client] = true;

	if (!SteamWorks_SendHTTPRequest(request))
	{
		g_ClientAccessCheckInFlight[client] = false;
		int unusedUserId = 0;
		TakeRequestUserId(request, unusedUserId);
		delete request;
		LogError("[KZ Guard] 发送进服校验 HTTP 请求失败，改用本地缓存：client=%N", client);
		HandleAccessCheckFallback(client);
	}
}

void SendBanSyncRequest(
	const char[] operatorName,
	const char[] operatorSteamIdentifier,
	const char[] targetNickname,
	const char[] targetSteamIdentifier,
	const char[] targetIpAddress,
	int durationMinutes,
	const char[] reason
)
{
	if (!HasBanSyncConfiguration())
	{
		return;
	}

	char payload[2048];
	BuildBanSyncPayload(
		payload,
		sizeof(payload),
		g_ServerId,
		operatorName,
		operatorSteamIdentifier,
		targetNickname,
		targetSteamIdentifier,
		targetIpAddress,
		durationMinutes,
		reason
	);

	Handle request = SteamWorks_CreateHTTPRequest(k_EHTTPMethodPOST, g_BanSyncUrl);
	if (request == null)
	{
		LogError("[KZ Guard] 创建封禁同步 HTTP 请求失败，请确认已安装 SteamWorks 扩展");
		return;
	}

	SteamWorks_SetHTTPRequestHeaderValue(request, "Content-Type", "application/json");
	SteamWorks_SetHTTPRequestHeaderValue(request, "X-Plugin-Token", g_PluginToken);
	SteamWorks_SetHTTPCallbacks(request, OnBanSyncCompleted);
	SteamWorks_SetHTTPRequestRawPostBody(request, "application/json", payload, strlen(payload));

	if (!SteamWorks_SendHTTPRequest(request))
	{
		delete request;
		LogError("[KZ Guard] 发送封禁同步 HTTP 请求失败，请确认 SteamWorks 扩展工作正常");
	}
}

void SendUnbanSyncRequest(
	const char[] operatorName,
	const char[] operatorSteamIdentifier,
	const char[] identity
)
{
	if (!HasUnbanSyncConfiguration())
	{
		return;
	}

	char payload[1024];
	BuildUnbanSyncPayload(
		payload,
		sizeof(payload),
		g_ServerId,
		operatorName,
		operatorSteamIdentifier,
		identity
	);

	Handle request = SteamWorks_CreateHTTPRequest(k_EHTTPMethodPOST, g_UnbanSyncUrl);
	if (request == null)
	{
		LogError("[KZ Guard] 创建解封同步 HTTP 请求失败，请确认已安装 SteamWorks 扩展");
		return;
	}

	SteamWorks_SetHTTPRequestHeaderValue(request, "Content-Type", "application/json");
	SteamWorks_SetHTTPRequestHeaderValue(request, "X-Plugin-Token", g_PluginToken);
	SteamWorks_SetHTTPCallbacks(request, OnUnbanSyncCompleted);
	SteamWorks_SetHTTPRequestRawPostBody(request, "application/json", payload, strlen(payload));

	if (!SteamWorks_SendHTTPRequest(request))
	{
		delete request;
		LogError("[KZ Guard] 发送解封同步 HTTP 请求失败，请确认 SteamWorks 扩展工作正常");
	}
}

void HandleAccessCheckFallback(int client)
{
	bool hasDecision = false;
	char reason[256];
	reason[0] = '\0';
	bool allow = EvaluateClientAccessFromLocalCache(client, hasDecision, reason, sizeof(reason));

	if (hasDecision)
	{
		if (!allow)
		{
			if (reason[0] == '\0')
			{
				strcopy(reason, sizeof(reason), "你当前不满足服务器准入条件。");
			}
			KickClient(client, "%s", reason);
			QueuePresenceReport(1.0);
		}
		return;
	}

	LogError("[KZ Guard] 本地准入缓存不可用，临时放行玩家：client=%N", client);
}

bool EvaluateClientAccessFromLocalCache(int client, bool &hasDecision, char[] reason, int maxlen)
{
	hasDecision = false;
	reason[0] = '\0';

	if (g_LocalAccessKv == null || !g_LocalAccessLoaded || g_ServerId[0] == '\0')
	{
		return true;
	}

	char steamId64[64];
	if (!GetClientAuthId(client, AuthId_SteamID64, steamId64, sizeof(steamId64), true))
	{
		return true;
	}

	g_LocalAccessKv.Rewind();
	if (!g_LocalAccessKv.JumpToKey("servers", false))
	{
		g_LocalAccessKv.Rewind();
		return true;
	}

	if (!g_LocalAccessKv.JumpToKey(g_ServerId, false))
	{
		g_LocalAccessKv.Rewind();
		return true;
	}

	bool whitelistEnabled = g_LocalAccessKv.GetNum("whitelistEnabled", 0) != 0;
	bool entryVerificationEnabled = g_LocalAccessKv.GetNum("entryVerificationEnabled", 0) != 0;
	int minEntryRating = g_LocalAccessKv.GetNum("minEntryRating", 0);
	int minSteamLevel = g_LocalAccessKv.GetNum("minSteamLevel", 0);

	if (g_LocalAccessKv.JumpToKey("players", false))
	{
		if (g_LocalAccessKv.JumpToKey(steamId64, false))
		{
			hasDecision = true;
			bool allow = g_LocalAccessKv.GetNum("canJoin", 0) != 0;
			g_LocalAccessKv.GetString("message", reason, maxlen, allow ? "允许进入服务器。" : "你当前不满足服务器准入条件。");
			g_LocalAccessKv.Rewind();
			return allow;
		}
	}

	hasDecision = true;
	if (!whitelistEnabled && !entryVerificationEnabled)
	{
		strcopy(reason, maxlen, "当前服务器未开启白名单与进服验证，允许进入。");
		g_LocalAccessKv.Rewind();
		return true;
	}

	if (whitelistEnabled && !entryVerificationEnabled)
	{
		strcopy(reason, maxlen, "当前服务器仅允许白名单玩家进入（共享缓存兜底）。");
		g_LocalAccessKv.Rewind();
		return false;
	}

	if (!whitelistEnabled && entryVerificationEnabled)
	{
		Format(reason, maxlen, "当前无法确认你的进服验证结果，请稍后重试（共享缓存兜底）。服务器要求最低 rating %d，最低 Steam 等级 %d。", minEntryRating, minSteamLevel);
		g_LocalAccessKv.Rewind();
		return false;
	}

	Format(reason, maxlen, "当前服务器已同时开启白名单和进服验证，且共享缓存中未找到你的准入记录。服务器要求最低 rating %d，最低 Steam 等级 %d。", minEntryRating, minSteamLevel);
	g_LocalAccessKv.Rewind();
	return false;
}

bool LoadLocalAccessCache()
{
	char cachePath[PLATFORM_MAX_PATH];
	BuildAccessCacheFilePath(cachePath, sizeof(cachePath));

	if (g_LocalAccessKv != null)
	{
		delete g_LocalAccessKv;
		g_LocalAccessKv = null;
	}
	g_LocalAccessLoaded = false;

	if (!FileExists(cachePath))
	{
		PrintToServer("[KZ Guard] 共享准入缓存文件暂不存在：%s", cachePath);
		return false;
	}

	KeyValues kv = new KeyValues("KZGuardAccessCache");
	if (!kv.ImportFromFile(cachePath))
	{
		LogError("[KZ Guard] 共享准入缓存文件读取失败：%s", cachePath);
		delete kv;
		return false;
	}

	g_LocalAccessKv = kv;
	g_LocalAccessLoaded = true;
	PrintToServer("[KZ Guard] 已加载共享准入缓存：%s", cachePath);
	return true;
}

void BuildAccessCacheFilePath(char[] path, int maxlen)
{
	char configuredPath[PLATFORM_MAX_PATH];
	strcopy(configuredPath, sizeof(configuredPath), g_AccessCacheFile);
	TrimString(configuredPath);

	if (configuredPath[0] == '\0')
	{
		strcopy(configuredPath, sizeof(configuredPath), "data/kzguard_access_cache.kv");
	}

	if (configuredPath[0] == '/' || (strlen(configuredPath) > 1 && configuredPath[1] == ':'))
	{
		strcopy(path, maxlen, configuredPath);
		return;
	}

	BuildPath(Path_SM, path, maxlen, "%s", configuredPath);
}

void BuildSyncUrl(const char[] baseUrl, const char[] serverId, char[] output, int maxlen)
{
	char separator[2];
	separator[0] = StrContains(baseUrl, "?") == -1 ? '?' : '&';
	separator[1] = '\0';
	Format(output, maxlen, "%s%sserverId=%s", baseUrl, separator, serverId);
}

void BuildAccessCheckUrl(const char[] baseUrl, const char[] serverId, const char[] steamId64, char[] output, int maxlen)
{
	char separator[2];
	separator[0] = StrContains(baseUrl, "?") == -1 ? '?' : '&';
	separator[1] = '\0';
	Format(output, maxlen, "%s%sserverId=%s&steamId64=%s", baseUrl, separator, serverId, steamId64);
}

bool ParseAccessCheckResponse(const char[] body, bool &allow, char[] message, int maxlen)
{
	char allowValue[16];
	if (!ExtractResponseField(body, "allow", allowValue, sizeof(allowValue)))
	{
		return false;
	}

	allow = StringToInt(allowValue) != 0;
	if (!ExtractResponseField(body, "message", message, maxlen))
	{
		message[0] = '\0';
	}
	TrimString(message);
	return true;
}

bool ExtractResponseField(const char[] body, const char[] key, char[] output, int maxlen)
{
	char lines[16][256];
	int count = ExplodeString(body, "\n", lines, sizeof(lines), sizeof(lines[]));
	char prefix[64];
	Format(prefix, sizeof(prefix), "%s=", key);
	int prefixLength = strlen(prefix);

	for (int i = 0; i < count; i++)
	{
		TrimString(lines[i]);
		if (StrContains(lines[i], prefix) == 0)
		{
			strcopy(output, maxlen, lines[i][prefixLength]);
			return true;
		}
	}

	output[0] = '\0';
	return false;
}

void StoreRequestUserId(Handle request, int userId)
{
	char key[32];
	IntToString(view_as<int>(request), key, sizeof(key));
	g_RequestUserIds.SetValue(key, userId);
}

bool TakeRequestUserId(Handle request, int &userId)
{
	char key[32];
	IntToString(view_as<int>(request), key, sizeof(key));
	bool found = g_RequestUserIds.GetValue(key, userId);
	g_RequestUserIds.Remove(key);
	return found;
}

void LogHttpSyncFailure(const char[] action, Handle request, bool failure, bool requestSuccessful, EHTTPStatusCode statusCode)
{
	int status = view_as<int>(statusCode);
	if (!(failure || !requestSuccessful || status < view_as<int>(k_EHTTPStatusCode200OK) || status >= 300))
	{
		return;
	}

	char body[1024];
	if (SteamWorks_GetHTTPResponseBodyData(request, body, sizeof(body)))
	{
		LogError(
			"[KZ Guard] %s失败：failure=%d requestSuccessful=%d status=%d body=%s",
			action,
			failure,
			requestSuccessful,
			status,
			body
		);
		return;
	}

	LogError(
		"[KZ Guard] %s失败：failure=%d requestSuccessful=%d status=%d",
		action,
		failure,
		requestSuccessful,
		status
	);
}

void BuildBanSyncPayload(
	char[] payload,
	int maxlen,
	const char[] serverId,
	const char[] operatorName,
	const char[] operatorSteamIdentifier,
	const char[] targetNickname,
	const char[] targetSteamIdentifier,
	const char[] targetIpAddress,
	int durationMinutes,
	const char[] reason
)
{
	char escapedServerId[192];
	char escapedOperatorName[256];
	char escapedOperatorSteamIdentifier[128];
	char escapedTargetNickname[256];
	char escapedTargetSteamIdentifier[128];
	char escapedTargetIpAddress[128];
	char escapedReason[512];
	EscapeJsonString(serverId, escapedServerId, sizeof(escapedServerId));
	EscapeJsonString(operatorName, escapedOperatorName, sizeof(escapedOperatorName));
	EscapeJsonString(operatorSteamIdentifier, escapedOperatorSteamIdentifier, sizeof(escapedOperatorSteamIdentifier));
	EscapeJsonString(targetNickname, escapedTargetNickname, sizeof(escapedTargetNickname));
	EscapeJsonString(targetSteamIdentifier, escapedTargetSteamIdentifier, sizeof(escapedTargetSteamIdentifier));
	EscapeJsonString(targetIpAddress, escapedTargetIpAddress, sizeof(escapedTargetIpAddress));
	EscapeJsonString(reason, escapedReason, sizeof(escapedReason));

	if (durationMinutes > 0)
	{
		Format(
			payload,
			maxlen,
			"{\"serverId\":\"%s\",\"nickname\":\"%s\",\"banType\":\"steam_account\",\"steamIdentifier\":\"%s\",\"ipAddress\":\"%s\",\"reason\":\"%s\",\"durationSeconds\":%d,\"operatorName\":\"%s\",\"operatorSteamIdentifier\":\"%s\"}",
			escapedServerId,
			escapedTargetNickname,
			escapedTargetSteamIdentifier,
			escapedTargetIpAddress,
			escapedReason,
			durationMinutes * 60,
			escapedOperatorName,
			escapedOperatorSteamIdentifier
		);
		return;
	}

	Format(
		payload,
		maxlen,
		"{\"serverId\":\"%s\",\"nickname\":\"%s\",\"banType\":\"steam_account\",\"steamIdentifier\":\"%s\",\"ipAddress\":\"%s\",\"reason\":\"%s\",\"durationSeconds\":null,\"operatorName\":\"%s\",\"operatorSteamIdentifier\":\"%s\"}",
		escapedServerId,
		escapedTargetNickname,
		escapedTargetSteamIdentifier,
		escapedTargetIpAddress,
		escapedReason,
		escapedOperatorName,
		escapedOperatorSteamIdentifier
	);
}

void BuildUnbanSyncPayload(
	char[] payload,
	int maxlen,
	const char[] serverId,
	const char[] operatorName,
	const char[] operatorSteamIdentifier,
	const char[] identity
)
{
	char escapedServerId[192];
	char escapedOperatorName[256];
	char escapedOperatorSteamIdentifier[128];
	char escapedIdentity[256];
	EscapeJsonString(serverId, escapedServerId, sizeof(escapedServerId));
	EscapeJsonString(operatorName, escapedOperatorName, sizeof(escapedOperatorName));
	EscapeJsonString(operatorSteamIdentifier, escapedOperatorSteamIdentifier, sizeof(escapedOperatorSteamIdentifier));
	EscapeJsonString(identity, escapedIdentity, sizeof(escapedIdentity));

	Format(
		payload,
		maxlen,
		"{\"serverId\":\"%s\",\"identity\":\"%s\",\"operatorName\":\"%s\",\"operatorSteamIdentifier\":\"%s\"}",
		escapedServerId,
		escapedIdentity,
		escapedOperatorName,
		escapedOperatorSteamIdentifier
	);
}

bool GetPreferredClientSteamIdentifier(int client, char[] output, int maxlen)
{
	if (GetClientAuthId(client, AuthId_SteamID64, output, maxlen, true))
	{
		return true;
	}

	if (GetClientAuthId(client, AuthId_Steam2, output, maxlen, true))
	{
		return true;
	}

	if (GetClientAuthId(client, AuthId_Steam3, output, maxlen, true))
	{
		return true;
	}

	output[0] = '\0';
	return false;
}

bool CaptureBanTargetSnapshot(
	int client,
	char[] nickname,
	int nicknameMaxlen,
	char[] steamIdentifier,
	int steamIdentifierMaxlen,
	char[] ipAddress,
	int ipAddressMaxlen
)
{
	if (client <= 0 || !IsClientInGame(client) || IsFakeClient(client))
	{
		nickname[0] = '\0';
		steamIdentifier[0] = '\0';
		ipAddress[0] = '\0';
		return false;
	}

	GetClientName(client, nickname, nicknameMaxlen);
	if (!GetPreferredClientSteamIdentifier(client, steamIdentifier, steamIdentifierMaxlen))
	{
		ipAddress[0] = '\0';
		return false;
	}

	if (!GetClientIP(client, ipAddress, ipAddressMaxlen, true))
	{
		ipAddress[0] = '\0';
	}

	return true;
}

void GetCommandOperatorProfile(
	int client,
	char[] operatorName,
	int operatorNameMaxlen,
	char[] operatorSteamIdentifier,
	int operatorSteamIdentifierMaxlen
)
{
	if (client > 0 && IsClientInGame(client))
	{
		GetClientName(client, operatorName, operatorNameMaxlen);
		if (!GetPreferredClientSteamIdentifier(client, operatorSteamIdentifier, operatorSteamIdentifierMaxlen))
		{
			operatorSteamIdentifier[0] = '\0';
		}
		return;
	}

	strcopy(operatorName, operatorNameMaxlen, "服务器控制台");
	operatorSteamIdentifier[0] = '\0';
}

bool IsLikelyIpAddress(const char[] value)
{
	int length = strlen(value);
	if (length < 7 || length > 15)
	{
		return false;
	}

	int dotCount = 0;
	for (int index = 0; index < length; index++)
	{
		char current = value[index];
		if (current == '.')
		{
			dotCount++;
			continue;
		}

		if (!IsCharNumeric(current))
		{
			return false;
		}
	}

	return dotCount == 3;
}

void BuildPresencePayload(char[] payload, int maxlen, const char[] serverId)
{
	payload[0] = '\0';

	char escapedServerId[192];
	EscapeJsonString(serverId, escapedServerId, sizeof(escapedServerId));
	AppendFormat(payload, maxlen, "{\"serverId\":\"%s\",\"players\":[", escapedServerId);

	bool firstPlayer = true;
	for (int client = 1; client <= MaxClients; client++)
	{
		if (!IsClientInGame(client) || IsFakeClient(client))
		{
			continue;
		}

		char nickname[MAX_NAME_LENGTH];
		char steamId[MAX_AUTHID_LENGTH];
		char steamId64[MAX_AUTHID_LENGTH];
		char steamId3[MAX_AUTHID_LENGTH];
		char ipAddress[64];
		GetClientName(client, nickname, sizeof(nickname));

		if (!GetClientAuthId(client, AuthId_Steam2, steamId, sizeof(steamId), true))
		{
			steamId[0] = '\0';
		}
		if (!GetClientAuthId(client, AuthId_SteamID64, steamId64, sizeof(steamId64), true))
		{
			steamId64[0] = '\0';
		}
		if (!GetClientAuthId(client, AuthId_Steam3, steamId3, sizeof(steamId3), true))
		{
			steamId3[0] = '\0';
		}
		if (!GetClientIP(client, ipAddress, sizeof(ipAddress), true))
		{
			ipAddress[0] = '\0';
		}

		int userId = GetClientUserId(client);
		int connectedSeconds = RoundToFloor(GetClientTime(client));
		int ping = RoundToNearest(GetClientAvgLatency(client, NetFlow_Both) * 500.0);
		AppendPlayerJson(
			payload,
			maxlen,
			firstPlayer,
			userId,
			nickname,
			steamId,
			steamId64,
			steamId3,
			ipAddress,
			connectedSeconds,
			ping
		);
		firstPlayer = false;
	}

	AppendString(payload, maxlen, "]}");
}

void AppendPlayerJson(
	char[] payload,
	int maxlen,
	bool firstPlayer,
	int userId,
	const char[] nickname,
	const char[] steamId,
	const char[] steamId64,
	const char[] steamId3,
	const char[] ipAddress,
	int connectedSeconds,
	int ping
)
{
	char escapedNickname[256];
	char escapedSteamId[128];
	char escapedSteamId64[128];
	char escapedSteamId3[128];
	char escapedIpAddress[128];
	EscapeJsonString(nickname, escapedNickname, sizeof(escapedNickname));
	EscapeJsonString(steamId, escapedSteamId, sizeof(escapedSteamId));
	EscapeJsonString(steamId64, escapedSteamId64, sizeof(escapedSteamId64));
	EscapeJsonString(steamId3, escapedSteamId3, sizeof(escapedSteamId3));
	EscapeJsonString(ipAddress, escapedIpAddress, sizeof(escapedIpAddress));

	if (!firstPlayer)
	{
		AppendString(payload, maxlen, ",");
	}

	AppendFormat(
		payload,
		maxlen,
		"{\"userId\":%d,\"nickname\":\"%s\",\"steamId\":\"%s\",\"steamId64\":\"%s\",\"steamId3\":\"%s\",\"ipAddress\":\"%s\",\"connectedSeconds\":%d,\"ping\":%d}",
		userId,
		escapedNickname,
		escapedSteamId,
		escapedSteamId64,
		escapedSteamId3,
		escapedIpAddress,
		connectedSeconds,
		ping
	);
}

void EscapeJsonString(const char[] input, char[] output, int maxlen)
{
	strcopy(output, maxlen, input);
	ReplaceString(output, maxlen, "\\", "\\\\");
	ReplaceString(output, maxlen, "\"", "\\\"");
	ReplaceString(output, maxlen, "\r", "");
	ReplaceString(output, maxlen, "\n", "\\n");
	ReplaceString(output, maxlen, "\t", "\\t");
}

void AppendString(char[] buffer, int maxlen, const char[] value)
{
	StrCat(buffer, maxlen, value);
}

void AppendFormat(char[] buffer, int maxlen, const char[] format, any ...)
{
	char chunk[2048];
	VFormat(chunk, sizeof(chunk), format, 4);
	StrCat(buffer, maxlen, chunk);
}
