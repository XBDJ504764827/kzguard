import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { apiService } from '../api';
import { clearStoredAuthToken, getStoredAuthToken, persistAuthToken } from '../api/authStorage';
import type {
  ApiMode,
  AppState,
  BanRecord,
  BanRecordOperator,
  BanRecordUpdateDraft,
  BanServerPlayerDraft,
  Community,
  ManualBanDraft,
  ManualWhitelistDraft,
  OperationLog,
  OperationLogAction,
  Server,
  ServerDraft,
  ServerPlayersSnapshot,
  ServerRconVerificationResult,
  ServerSettingsDraft,
  ThemeMode,
  UserSummary,
  WebsiteAdmin,
  WebsiteAdminCreateDraft,
  WebsiteAdminUpdateDraft,
  WhitelistPlayer,
  WhitelistPlayerUpdateDraft,
} from '../types';
import { banTypeLabelMap, getBanDurationLabel } from '../utils/ban';
import { applyTheme, getPreferredTheme, persistTheme } from '../utils/theme';

const emptyState: AppState = {
  communities: [],
  whitelist: [],
  bans: [],
};

interface AppStoreContextValue {
  state: AppState;
  theme: ThemeMode;
  apiMode: ApiMode;
  apiError: string | null;
  bootstrapping: boolean;
  isAuthenticated: boolean;
  userSummary: UserSummary | null;
  websiteUsers: WebsiteAdmin[];
  currentAdmin: WebsiteAdmin | null;
  operationLogs: OperationLog[];
  setTheme: (theme: ThemeMode) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshState: () => Promise<void>;
  createWebsiteAdmin: (draft: WebsiteAdminCreateDraft) => Promise<WebsiteAdmin>;
  updateWebsiteAdmin: (adminId: string, draft: WebsiteAdminUpdateDraft) => Promise<WebsiteAdmin>;
  addCommunity: (name: string) => Promise<Community>;
  updateCommunity: (communityId: string, name: string) => Promise<Community>;
  deleteCommunity: (communityId: string) => Promise<void>;
  verifyServerRcon: (communityId: string, draft: ServerDraft) => Promise<ServerRconVerificationResult>;
  addServer: (communityId: string, draft: ServerDraft) => Promise<Server>;
  updateServer: (communityId: string, serverId: string, draft: ServerSettingsDraft) => Promise<Server>;
  resetServerPluginToken: (communityId: string, serverId: string) => Promise<Server>;
  restartServer: (communityId: string, serverId: string) => Promise<void>;
  deleteServer: (communityId: string, serverId: string) => Promise<void>;
  loadServerPlayers: (communityId: string, serverId: string) => Promise<ServerPlayersSnapshot>;
  kickServerPlayer: (communityId: string, serverId: string, playerId: string, reason: string) => Promise<void>;
  banServerPlayer: (communityId: string, serverId: string, playerId: string, draft: BanServerPlayerDraft) => Promise<void>;
  manualBanPlayer: (draft: ManualBanDraft) => Promise<BanRecord>;
  updateBanRecord: (banId: string, draft: BanRecordUpdateDraft) => Promise<BanRecord>;
  revokeBanRecord: (banId: string) => Promise<BanRecord>;
  deleteBanRecord: (banId: string) => Promise<void>;
  approvePlayer: (playerId: string, note?: string) => Promise<void>;
  rejectPlayer: (playerId: string, note?: string) => Promise<void>;
  manualAddPlayer: (draft: ManualWhitelistDraft) => Promise<WhitelistPlayer>;
  updateWhitelistPlayer: (playerId: string, draft: WhitelistPlayerUpdateDraft) => Promise<WhitelistPlayer>;
  deleteWhitelistPlayer: (playerId: string) => Promise<void>;
}

const AppStoreContext = createContext<AppStoreContextValue | null>(null);

const createId = (prefix: string) => {
  const secureId = globalThis.crypto?.randomUUID?.();
  const fallbackId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}_${secureId ?? fallbackId}`;
};
const normalizeText = (value?: string) => value?.trim() || undefined;
const normalizeServer = (server: Server, fallback?: Partial<Server>): Server => ({
  ...server,
  whitelistEnabled: server.whitelistEnabled ?? fallback?.whitelistEnabled ?? false,
  entryVerificationEnabled: server.entryVerificationEnabled ?? fallback?.entryVerificationEnabled ?? false,
  minEntryRating: server.minEntryRating ?? fallback?.minEntryRating ?? 0,
  minSteamLevel: server.minSteamLevel ?? fallback?.minSteamLevel ?? 0,
  playerReportedAt: server.playerReportedAt ?? fallback?.playerReportedAt,
  pluginToken: server.pluginToken ?? fallback?.pluginToken ?? '',
  restartConfigured: server.restartConfigured ?? fallback?.restartConfigured ?? false,
  restartCommand: server.restartCommand ?? fallback?.restartCommand,
  onlinePlayers: Array.isArray(server.onlinePlayers) ? server.onlinePlayers : fallback?.onlinePlayers ?? [],
});
const getBanOperatorSnapshot = (admin: WebsiteAdmin | null): BanRecordOperator => {
  if (!admin) {
    throw new Error('当前没有登录管理员');
  }

  return {
    id: admin.id,
    name: admin.displayName,
    role: admin.role,
  };
};

export const AppStoreProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AppState>(emptyState);
  const [theme, setThemeState] = useState<ThemeMode>(getPreferredTheme);
  const [apiError, setApiError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [websiteUsers, setWebsiteUsers] = useState<WebsiteAdmin[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<WebsiteAdmin | null>(null);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [authToken, setAuthToken] = useState(getStoredAuthToken);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const clearProtectedState = () => {
    setState(emptyState);
    setUserSummary(null);
    setWebsiteUsers([]);
    setCurrentAdmin(null);
    setOperationLogs([]);
  };

  const hydrateProtectedState = async (activeAdmin: WebsiteAdmin | null) => {
    const [nextState, nextUserSummary, nextAdmins, nextOperationLogs] = await Promise.all([
      apiService.loadState(),
      apiService.getUsersSummary().catch(() => null),
      apiService.listWebsiteAdmins(),
      apiService.listOperationLogs(),
    ]);

    setState(nextState);
    setUserSummary(nextUserSummary);
    setWebsiteUsers(nextAdmins);
    setOperationLogs(nextOperationLogs);
    setCurrentAdmin(nextAdmins.find((admin) => admin.id === activeAdmin?.id) ?? activeAdmin ?? nextAdmins[0] ?? null);
    setApiError(null);
  };

  const appendOperationLog = (action: OperationLogAction, detail: string, operator = currentAdmin) => {
    if (!operator) {
      return;
    }

    const log: OperationLog = {
      id: createId('log'),
      createdAt: new Date().toISOString(),
      operatorId: operator.id,
      operatorName: operator.displayName,
      operatorRole: operator.role,
      action,
      detail,
    };

    setOperationLogs((currentLogs) => [log, ...currentLogs]);
  };

  const refreshState = async () => {
    const nextState = await apiService.loadState();
    setState(nextState);
    setApiError(null);
  };

  const applyServerPlayersSnapshot = (communityId: string, serverId: string, snapshot: ServerPlayersSnapshot) => {
    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.map((community) => {
        if (community.id !== communityId) {
          return community;
        }

        return {
          ...community,
          servers: community.servers.map((server) => {
            if (server.id !== serverId) {
              return server;
            }

            return {
              ...server,
              onlinePlayers: snapshot.players,
              playerReportedAt: snapshot.reportedAt,
            };
          }),
        };
      }),
    }));
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setBootstrapping(true);

      if (!authToken) {
        if (mounted) {
          clearProtectedState();
          setApiError(null);
          setBootstrapping(false);
        }
        return;
      }

      try {
        const nextAdmin = await apiService.getAuthSession();

        if (!mounted) {
          return;
        }

        await hydrateProtectedState(nextAdmin);
      } catch (error) {
        if (!mounted) {
          return;
        }

        clearStoredAuthToken();
        setAuthToken('');
        clearProtectedState();
        setApiError(error instanceof Error ? error.message : '登录状态已失效，请重新登录');
      } finally {
        if (mounted) {
          setBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
  };

  const login = async (username: string, password: string) => {
    setBootstrapping(true);

    try {
      const session = await apiService.login({
        username: username.trim(),
        password,
      });

      persistAuthToken(session.token);
      setAuthToken(session.token);
      await hydrateProtectedState(session.admin);
      setApiError(null);
    } catch (error) {
      clearStoredAuthToken();
      setAuthToken('');
      clearProtectedState();
      setApiError(error instanceof Error ? error.message : '登录失败');
      throw error;
    } finally {
      setBootstrapping(false);
    }
  };

  const logout = async () => {
    try {
      await apiService.logout();
    } catch {
      // ignore logout errors locally and always clear session state
    }

    clearStoredAuthToken();
    setAuthToken('');
    clearProtectedState();
    setApiError(null);
  };

  const createWebsiteAdmin = async (draft: WebsiteAdminCreateDraft) => {
    const createdAdmin = await apiService.createWebsiteAdmin({
      ...draft,
      username: draft.username.trim(),
      displayName: draft.displayName.trim(),
      password: draft.password,
      email: normalizeText(draft.email),
      note: normalizeText(draft.note),
    });

    setWebsiteUsers((currentAdmins) => [...currentAdmins, createdAdmin]);
    setApiError(null);

    appendOperationLog(
      'admin_created',
      `新增了管理员 ${createdAdmin.displayName}，用户名为 ${createdAdmin.username}，角色为 ${createdAdmin.role === 'system_admin' ? '系统管理员' : '普通管理员'}。`,
    );

    return createdAdmin;
  };

  const updateWebsiteAdmin = async (adminId: string, draft: WebsiteAdminUpdateDraft) => {
    const updatedAdmin = await apiService.updateWebsiteAdmin(adminId, draft);

    setWebsiteUsers((currentAdmins) => currentAdmins.map((admin) => (admin.id === adminId ? updatedAdmin : admin)));
    if (currentAdmin?.id === adminId) {
      setCurrentAdmin(updatedAdmin);
    }
    setApiError(null);

    appendOperationLog(
      'admin_profile_updated',
      currentAdmin?.id === adminId
        ? `修改了自己的管理员资料，当前用户名为 ${updatedAdmin.username}。`
        : `修改了管理员 ${updatedAdmin.displayName} 的资料，当前用户名为 ${updatedAdmin.username}。`,
    );

    return updatedAdmin;
  };

  const addCommunity = async (name: string) => {
    const community = await apiService.createCommunity(name);

    setState((currentState) => ({
      ...currentState,
      communities: [community, ...currentState.communities],
    }));
    setApiError(null);

    appendOperationLog('community_created', `新增社区 “${community.name}”。`);

    return community;
  };

  const updateCommunity = async (communityId: string, name: string) => {
    const currentCommunity = state.communities.find((item) => item.id === communityId);

    if (!currentCommunity) {
      throw new Error('未找到要编辑的社区');
    }

    const updatedCommunity = await apiService.updateCommunity(communityId, name.trim());

    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.map((community) =>
        community.id === communityId ? updatedCommunity : community,
      ),
    }));
    setApiError(null);

    appendOperationLog(
      'community_updated',
      `将社区 “${currentCommunity.name}” 重命名为 “${updatedCommunity.name}”。`,
    );

    return updatedCommunity;
  };

  const deleteCommunity = async (communityId: string) => {
    const community = state.communities.find((item) => item.id === communityId);

    if (!community) {
      throw new Error('未找到要删除的社区');
    }

    await apiService.deleteCommunity(communityId);

    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.filter((item) => item.id !== communityId),
    }));
    setApiError(null);

    appendOperationLog('community_deleted', `删除了社区 “${community.name}”。`);
  };

  const verifyServerRcon = async (communityId: string, draft: ServerDraft) => {
    const result = await apiService.verifyServerRcon(communityId, {
      ...draft,
      name: draft.name.trim(),
      ip: draft.ip.trim(),
      rconPassword: draft.rconPassword,
    });

    setApiError(null);

    return result;
  };

  const addServer = async (communityId: string, draft: ServerDraft) => {
    const createdServer = await apiService.createServer(communityId, {
      ...draft,
      restartCommand: currentAdmin?.role === 'system_admin' ? normalizeText(draft.restartCommand) : undefined,
    });
    const server = normalizeServer(createdServer, {
      whitelistEnabled: draft.whitelistEnabled,
      entryVerificationEnabled: draft.entryVerificationEnabled,
      minEntryRating: draft.minEntryRating,
      minSteamLevel: draft.minSteamLevel,
      restartConfigured: Boolean(normalizeText(draft.restartCommand)),
      restartCommand: currentAdmin?.role === 'system_admin' ? normalizeText(draft.restartCommand) : undefined,
      onlinePlayers: [],
    });
    const community = state.communities.find((item) => item.id === communityId);

    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.map((communityItem) => {
        if (communityItem.id !== communityId) {
          return communityItem;
        }

        return {
          ...communityItem,
          servers: [server, ...communityItem.servers],
        };
      }),
    }));
    setApiError(null);

    appendOperationLog(
      'server_created',
      `向社区 “${community?.name ?? '未知社区'}” 添加服务器 ${server.name}（${server.ip}:${server.port}），并完成 RCON 校验。`,
    );

    return server;
  };

  const updateServer = async (communityId: string, serverId: string, draft: ServerSettingsDraft) => {
    const community = state.communities.find((item) => item.id === communityId);
    const currentServer = community?.servers.find((item) => item.id === serverId);
    const updatedServer = await apiService.updateServer(communityId, serverId, {
      ...draft,
      restartCommand: currentAdmin?.role === 'system_admin' ? normalizeText(draft.restartCommand) : undefined,
    });
    const server = normalizeServer(updatedServer, {
      ...currentServer,
      whitelistEnabled: draft.whitelistEnabled,
      entryVerificationEnabled: draft.entryVerificationEnabled,
      minEntryRating: draft.minEntryRating,
      minSteamLevel: draft.minSteamLevel,
      restartConfigured: currentAdmin?.role === 'system_admin'
        ? Boolean(normalizeText(draft.restartCommand))
        : currentServer?.restartConfigured,
      restartCommand: currentAdmin?.role === 'system_admin'
        ? normalizeText(draft.restartCommand)
        : currentServer?.restartCommand,
    });

    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.map((communityItem) => {
        if (communityItem.id !== communityId) {
          return communityItem;
        }

        return {
          ...communityItem,
          servers: communityItem.servers.map((serverItem) => (serverItem.id === serverId ? server : serverItem)),
        };
      }),
    }));
    setApiError(null);

    appendOperationLog(
      'server_updated',
      `更新了服务器 ${server.name} 的连接参数为 ${server.ip}:${server.port}，白名单${server.whitelistEnabled ? '开启' : '关闭'}，进服验证${server.entryVerificationEnabled ? '开启' : '关闭'}。`,
    );

    return server;
  };

  const resetServerPluginToken = async (communityId: string, serverId: string) => {
    const community = state.communities.find((item) => item.id === communityId);
    const currentServer = community?.servers.find((item) => item.id === serverId);

    if (!community || !currentServer) {
      throw new Error('未找到要重置 Token 的服务器');
    }

    const updatedServer = await apiService.resetServerPluginToken(communityId, serverId);
    const server = normalizeServer(updatedServer, currentServer);

    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.map((communityItem) => {
        if (communityItem.id !== communityId) {
          return communityItem;
        }

        return {
          ...communityItem,
          servers: communityItem.servers.map((serverItem) => (serverItem.id === serverId ? server : serverItem)),
        };
      }),
    }));
    setApiError(null);

    appendOperationLog(
      'server_plugin_token_reset',
      `重置了社区 “${community.name}” 下服务器 ${server.name} 的 Plugin Token。`,
    );

    return server;
  };

  const restartServer = async (communityId: string, serverId: string) => {
    const community = state.communities.find((item) => item.id === communityId);
    const server = community?.servers.find((item) => item.id === serverId);

    if (!community || !server) {
      throw new Error('未找到要重启的服务器');
    }

    await apiService.restartServer(communityId, serverId);
    setApiError(null);

    appendOperationLog(
      'server_restarted',
      `重启了社区 “${community.name}” 下的服务器 ${server.name}（${server.ip}:${server.port}）。`,
    );
  };

  const deleteServer = async (communityId: string, serverId: string) => {
    const community = state.communities.find((item) => item.id === communityId);
    const server = community?.servers.find((item) => item.id === serverId);

    if (!community || !server) {
      throw new Error('未找到要删除的服务器');
    }

    await apiService.deleteServer(communityId, serverId);

    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.map((communityItem) => {
        if (communityItem.id !== communityId) {
          return communityItem;
        }

        return {
          ...communityItem,
          servers: communityItem.servers.filter((serverItem) => serverItem.id !== serverId),
        };
      }),
    }));
    setApiError(null);

    appendOperationLog(
      'server_deleted',
      `删除了社区 “${community.name}” 下的服务器 ${server.name}（${server.ip}:${server.port}）。`,
    );
  };

  const loadServerPlayers = async (communityId: string, serverId: string) => {
    const snapshot = await apiService.listServerPlayers(communityId, serverId);

    applyServerPlayersSnapshot(communityId, serverId, snapshot);
    setApiError(null);

    return snapshot;
  };

  const kickServerPlayer = async (communityId: string, serverId: string, playerId: string, reason: string) => {
    const community = state.communities.find((item) => item.id === communityId);
    const server = community?.servers.find((item) => item.id === serverId);
    const player = server?.onlinePlayers.find((item) => item.id === playerId);
    const nextReason = reason.trim();

    await apiService.kickServerPlayer(communityId, serverId, playerId, nextReason);

    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.map((communityItem) => {
        if (communityItem.id !== communityId) {
          return communityItem;
        }

        return {
          ...communityItem,
          servers: communityItem.servers.map((serverItem) => {
            if (serverItem.id !== serverId) {
              return serverItem;
            }

            return {
              ...serverItem,
              onlinePlayers: serverItem.onlinePlayers.filter((item) => item.id !== playerId),
            };
          }),
        };
      }),
    }));
    setApiError(null);

    appendOperationLog(
      'server_player_kicked',
      `从服务器 ${server?.name ?? serverId} 踢出了玩家 ${player?.nickname ?? playerId}。原因：${nextReason}`,
    );
  };

  const banServerPlayer = async (communityId: string, serverId: string, playerId: string, draft: BanServerPlayerDraft) => {
    const community = state.communities.find((item) => item.id === communityId);
    const server = community?.servers.find((item) => item.id === serverId);
    const player = server?.onlinePlayers.find((item) => item.id === playerId);
    const reason = draft.reason.trim();
    const ipAddress = draft.ipAddress ?? player?.ipAddress ?? '未知 IP';
    const operator = getBanOperatorSnapshot(currentAdmin);

    const ban = await apiService.banServerPlayer(
      communityId,
      serverId,
      playerId,
      {
        ...draft,
        reason,
        ipAddress,
      },
      operator,
    );

    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.map((communityItem) => {
        if (communityItem.id !== communityId) {
          return communityItem;
        }

        return {
          ...communityItem,
          servers: communityItem.servers.map((serverItem) => {
            if (serverItem.id !== serverId) {
              return serverItem;
            }

            return {
              ...serverItem,
              onlinePlayers: serverItem.onlinePlayers.filter((item) => item.id !== playerId),
            };
          }),
        };
      }),
      bans: [ban, ...currentState.bans],
    }));
    setApiError(null);

    appendOperationLog(
      'server_player_banned',
      `在服务器 ${ban.serverName} 以${banTypeLabelMap[ban.banType]}封禁了玩家 ${ban.nickname ?? ban.steamId}，IP：${ban.ipAddress ?? '等待玩家下次进服自动回填'}，时长为 ${getBanDurationLabel(ban.durationSeconds)}。原因：${ban.reason}`,
    );
  };

  const manualBanPlayer = async (draft: ManualBanDraft) => {
    const operator = getBanOperatorSnapshot(currentAdmin);
    const ban = await apiService.createManualBanEntry(
      {
        ...draft,
        nickname: normalizeText(draft.nickname),
        steamIdentifier: draft.steamIdentifier.trim(),
        ipAddress: normalizeText(draft.ipAddress),
        reason: draft.reason.trim(),
      },
      operator,
    );

    setState((currentState) => ({
      ...currentState,
      bans: [ban, ...currentState.bans],
    }));
    setApiError(null);

    appendOperationLog(
      'ban_record_manual_created',
      `手动添加了${banTypeLabelMap[ban.banType]}记录：玩家 ${ban.nickname ?? '待后端匹配'}，Steam 标识 ${ban.steamIdentifier}，IP：${ban.ipAddress ?? '等待玩家下次进服自动回填'}，时长为 ${getBanDurationLabel(ban.durationSeconds)}。原因：${ban.reason}`,
    );

    return ban;
  };

  const updateBanRecord = async (banId: string, draft: BanRecordUpdateDraft) => {
    const currentBan = state.bans.find((item) => item.id === banId);

    if (!currentBan) {
      throw new Error('未找到要编辑的封禁记录');
    }

    const updatedBan = await apiService.updateBanRecord(
      banId,
      {
        ...draft,
        nickname: normalizeText(draft.nickname),
        steamIdentifier: draft.steamIdentifier.trim(),
        ipAddress: normalizeText(draft.ipAddress),
        reason: draft.reason.trim(),
        serverName: normalizeText(draft.serverName),
        communityName: normalizeText(draft.communityName),
      },
      getBanOperatorSnapshot(currentAdmin),
    );

    setState((currentState) => ({
      ...currentState,
      bans: currentState.bans.map((ban) => (ban.id === banId ? updatedBan : ban)),
    }));
    setApiError(null);

    appendOperationLog(
      'ban_record_updated',
      `编辑了封禁记录 ${currentBan.nickname ?? currentBan.steamId}，更新为${banTypeLabelMap[updatedBan.banType]}，时长为 ${getBanDurationLabel(updatedBan.durationSeconds)}，原因：${updatedBan.reason}`,
    );

    return updatedBan;
  };

  const revokeBanRecord = async (banId: string) => {
    const currentBan = state.bans.find((item) => item.id === banId);

    if (!currentBan) {
      throw new Error('未找到要解除的封禁记录');
    }

    const revokedBan = await apiService.revokeBanRecord(banId, getBanOperatorSnapshot(currentAdmin));

    setState((currentState) => ({
      ...currentState,
      bans: currentState.bans.map((ban) => (ban.id === banId ? revokedBan : ban)),
    }));
    setApiError(null);

    appendOperationLog(
      'ban_record_revoked',
      currentBan.status === 'revoked' && currentBan.source === 'server_action'
        ? `重新同步了玩家 ${revokedBan.nickname ?? revokedBan.steamId} 在游戏服上的本地解封。`
        : `解除了玩家 ${revokedBan.nickname ?? revokedBan.steamId} 的封禁，原封禁属性为${banTypeLabelMap[revokedBan.banType]}。`,
    );

    return revokedBan;
  };

  const deleteBanRecord = async (banId: string) => {
    const currentBan = state.bans.find((item) => item.id === banId);

    if (!currentBan) {
      throw new Error('未找到要删除的封禁记录');
    }

    await apiService.deleteBanRecord(banId, getBanOperatorSnapshot(currentAdmin));

    setState((currentState) => ({
      ...currentState,
      bans: currentState.bans.filter((ban) => ban.id !== banId),
    }));
    setApiError(null);

    appendOperationLog(
      'ban_record_deleted',
      `删除了封禁记录 ${currentBan.nickname ?? currentBan.steamId}（${banTypeLabelMap[currentBan.banType]}）。`,
    );
  };

  const updatePlayerStatus = async (playerId: string, status: 'approved' | 'rejected', note?: string) => {
    const player = state.whitelist.find((item) => item.id === playerId);
    const normalizedNote = normalizeText(note);

    if (status === 'rejected' && !normalizedNote) {
      throw new Error('驳回白名单申请时必须填写缘由');
    }

    await apiService.updateWhitelistStatus(playerId, status, normalizedNote);

    setState((currentState) => ({
      ...currentState,
      whitelist: currentState.whitelist.map((whitelistPlayer) => {
        if (whitelistPlayer.id !== playerId) {
          return whitelistPlayer;
        }

        return {
          ...whitelistPlayer,
          status,
          note: normalizedNote ?? whitelistPlayer.note,
          reviewedAt: new Date().toISOString(),
        };
      }),
    }));
    setApiError(null);

    appendOperationLog(
      status === 'approved' ? 'whitelist_approved' : 'whitelist_rejected',
      `${status === 'approved' ? '审核通过' : '审核拒绝'}玩家 ${player?.nickname ?? playerId} 的白名单申请。${normalizedNote ? ` 备注：${normalizedNote}` : ''}`,
    );
  };

  const approvePlayer = async (playerId: string, note?: string) => {
    await updatePlayerStatus(playerId, 'approved', note);
  };

  const rejectPlayer = async (playerId: string, note?: string) => {
    await updatePlayerStatus(playerId, 'rejected', note);
  };

  const manualAddPlayer = async (draft: ManualWhitelistDraft) => {
    const player = await apiService.createManualWhitelistEntry(draft);

    setState((currentState) => ({
      ...currentState,
      whitelist: [player, ...currentState.whitelist],
    }));
    setApiError(null);

    appendOperationLog(
      'whitelist_manual_added',
      `手动录入玩家 ${player.nickname} 到白名单，结果为 ${player.status === 'approved' ? '已通过' : '已拒绝'}。`,
    );

    return player;
  };

  const updateWhitelistPlayer = async (playerId: string, draft: WhitelistPlayerUpdateDraft) => {
    const currentPlayer = state.whitelist.find((item) => item.id === playerId);

    if (!currentPlayer) {
      throw new Error('未找到要编辑的白名单记录');
    }

    const updatedPlayer = await apiService.updateWhitelistPlayer(playerId, {
      nickname: draft.nickname.trim(),
      steamId: draft.steamId.trim(),
      contact: normalizeText(draft.contact),
      note: normalizeText(draft.note),
    });

    setState((currentState) => ({
      ...currentState,
      whitelist: currentState.whitelist.map((player) => (player.id === playerId ? updatedPlayer : player)),
    }));
    setApiError(null);

    appendOperationLog('whitelist_player_updated', `编辑了白名单玩家 ${updatedPlayer.nickname} 的资料。`);

    return updatedPlayer;
  };

  const deleteWhitelistPlayer = async (playerId: string) => {
    const currentPlayer = state.whitelist.find((item) => item.id === playerId);

    if (!currentPlayer) {
      throw new Error('未找到要删除的白名单记录');
    }

    await apiService.deleteWhitelistPlayer(playerId);

    setState((currentState) => ({
      ...currentState,
      whitelist: currentState.whitelist.filter((player) => player.id !== playerId),
    }));
    setApiError(null);

    appendOperationLog(
      'whitelist_player_deleted',
      `删除了白名单玩家 ${currentPlayer.nickname}（${currentPlayer.source === 'manual' ? '管理员手动录入' : '玩家申请'}）。`,
    );
  };

  const value = useMemo<AppStoreContextValue>(
    () => ({
      state,
      theme,
      apiMode: apiService.mode,
      apiError,
      bootstrapping,
      isAuthenticated: Boolean(authToken && currentAdmin),
      userSummary,
      websiteUsers,
      currentAdmin,
      operationLogs,
      setTheme,
      login,
      logout,
      refreshState,
      createWebsiteAdmin,
      updateWebsiteAdmin,
      addCommunity,
      updateCommunity,
      deleteCommunity,
      verifyServerRcon,
      addServer,
      updateServer,
      resetServerPluginToken,
      restartServer,
      deleteServer,
      loadServerPlayers,
      kickServerPlayer,
      banServerPlayer,
      manualBanPlayer,
      updateBanRecord,
      revokeBanRecord,
      deleteBanRecord,
      approvePlayer,
      rejectPlayer,
      manualAddPlayer,
      updateWhitelistPlayer,
      deleteWhitelistPlayer,
    }),
    [apiError, authToken, bootstrapping, currentAdmin, operationLogs, state, theme, userSummary, websiteUsers],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
};

export const useAppStore = () => {
  const context = useContext(AppStoreContext);

  if (!context) {
    throw new Error('useAppStore must be used within AppStoreProvider');
  }

  return context;
};
