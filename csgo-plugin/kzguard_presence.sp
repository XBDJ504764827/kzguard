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
	description = "Reports live CS:GO players to KZ Guard and exposes kick/ban commands for RCON",
	version = "0.1.0",
	url = ""
};

ConVar g_ApiUrlCvar;
ConVar g_ServerIdCvar;
ConVar g_RconPasswordCvar;
ConVar g_ReportIntervalCvar;
Handle g_ReportTimer = null;
bool g_ReportInFlight = false;

public void OnPluginStart()
{
	g_ApiUrlCvar = CreateConVar(
		"kzguard_api_url",
		"",
		"KZ Guard 后端玩家上报 API 地址，例如 http://192.168.0.132:3000/api/internal/server-presence/report"
	);
	g_ServerIdCvar = CreateConVar(
		"kzguard_server_id",
		"",
		"KZ Guard 后台中的服务器 ID"
	);
	g_RconPasswordCvar = CreateConVar(
		"kzguard_server_rcon_password",
		"",
		"KZ Guard 后台配置的该服务器 RCON 密码，用于上报校验"
	);
	g_ReportIntervalCvar = CreateConVar(
		"kzguard_report_interval",
		"15",
		"在线玩家上报间隔（秒）",
		0,
		true,
		5.0,
		true,
		120.0
	);

	RegServerCmd("kzguard_kick_userid", Command_KickUserId, "KZ Guard 按 userid 踢出玩家");
	RegServerCmd("kzguard_ban_userid", Command_BanUserId, "KZ Guard 按 userid 封禁玩家");

	AutoExecConfig(true, "kzguard");
	PrintToServer("[KZ Guard] 已生成或加载配置文件 cfg/sourcemod/kzguard.cfg，请在该文件中填写上报地址与服务器标识。");
	ResetReportTimer();
}

public void OnConfigsExecuted()
{
	ResetReportTimer();
	QueuePresenceReport(2.0);
}

public void OnMapStart()
{
	QueuePresenceReport(2.0);
}

public void OnClientPutInServer(int client)
{
	if (!IsFakeClient(client))
	{
		QueuePresenceReport(2.0);
	}
}

public void OnClientDisconnect_Post(int client)
{
	if (!IsFakeClient(client))
	{
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

public Action Timer_ReportPresence(Handle timer, any data)
{
	SendPresenceReport();
	return Plugin_Continue;
}

public Action Timer_QueuedReport(Handle timer, any data)
{
	SendPresenceReport();
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

void ResetReportTimer()
{
	if (g_ReportTimer != null)
	{
		KillTimer(g_ReportTimer);
		g_ReportTimer = null;
	}

	g_ReportTimer = CreateTimer(
		g_ReportIntervalCvar.FloatValue,
		Timer_ReportPresence,
		_,
		TIMER_REPEAT | TIMER_FLAG_NO_MAPCHANGE
	);
}

void QueuePresenceReport(float delay)
{
	CreateTimer(delay, Timer_QueuedReport, _, TIMER_FLAG_NO_MAPCHANGE);
}

void SendPresenceReport()
{
	if (g_ReportInFlight)
	{
		return;
	}

	char apiUrl[256];
	char serverId[128];
	char rconPassword[128];
	g_ApiUrlCvar.GetString(apiUrl, sizeof(apiUrl));
	g_ServerIdCvar.GetString(serverId, sizeof(serverId));
	g_RconPasswordCvar.GetString(rconPassword, sizeof(rconPassword));
	TrimString(apiUrl);
	TrimString(serverId);
	TrimString(rconPassword);

	if (apiUrl[0] == '\0' || serverId[0] == '\0' || rconPassword[0] == '\0')
	{
		LogError("[KZ Guard] 未完成配置，请检查 kzguard_api_url / kzguard_server_id / kzguard_server_rcon_password");
		return;
	}

	char payload[32768];
	BuildPresencePayload(payload, sizeof(payload), serverId);

	Handle request = SteamWorks_CreateHTTPRequest(k_EHTTPMethodPOST, apiUrl);
	if (request == null)
	{
		LogError("[KZ Guard] 创建 HTTP 请求失败，请确认已安装 SteamWorks 扩展");
		return;
	}

	SteamWorks_SetHTTPRequestHeaderValue(request, "Content-Type", "application/json");
	SteamWorks_SetHTTPRequestHeaderValue(request, "X-Server-Rcon-Password", rconPassword);
	SteamWorks_SetHTTPCallbacks(request, OnPresenceReportCompleted);
	SteamWorks_SetHTTPRequestRawPostBody(request, "application/json", payload, strlen(payload));

	g_ReportInFlight = true;
	if (!SteamWorks_SendHTTPRequest(request))
	{
		g_ReportInFlight = false;
		delete request;
		LogError("[KZ Guard] 发送 HTTP 请求失败，请确认 SteamWorks 扩展工作正常");
	}
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
