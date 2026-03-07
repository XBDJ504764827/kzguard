import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { apiService } from '../api';
import { initialOperationLogs, initialWebsiteUserState } from '../data/adminMockData';
import { initialState } from '../data/mockData';
import type {
  ApiMode,
  AppState,
  ApplicationDraft,
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
  ServerSettingsDraft,
  ThemeMode,
  UserSummary,
  WebsiteAdmin,
  WebsiteAdminUpdateDraft,
  WebsiteUserState,
  WhitelistPlayer,
} from '../types';
import { banTypeLabelMap, getBanDurationLabel } from '../utils/ban';
import { applyTheme, getPreferredTheme, persistTheme } from '../utils/theme';

const WEBSITE_USER_STORAGE_KEY = 'kzguard-website-user-state-v1';
const OPERATION_LOG_STORAGE_KEY = 'kzguard-operation-logs-v1';

interface AppStoreContextValue {
  state: AppState;
  theme: ThemeMode;
  apiMode: ApiMode;
  apiError: string | null;
  bootstrapping: boolean;
  userSummary: UserSummary | null;
  websiteUsers: WebsiteAdmin[];
  currentAdmin: WebsiteAdmin | null;
  operationLogs: OperationLog[];
  setTheme: (theme: ThemeMode) => void;
  refreshState: () => Promise<void>;
  switchCurrentAdmin: (adminId: string) => void;
  updateWebsiteAdmin: (adminId: string, draft: WebsiteAdminUpdateDraft) => Promise<WebsiteAdmin>;
  addCommunity: (name: string) => Promise<Community>;
  addServer: (communityId: string, draft: ServerDraft) => Promise<Server>;
  updateServer: (communityId: string, serverId: string, draft: ServerSettingsDraft) => Promise<Server>;
  kickServerPlayer: (communityId: string, serverId: string, playerId: string, reason: string) => Promise<void>;
  banServerPlayer: (communityId: string, serverId: string, playerId: string, draft: BanServerPlayerDraft) => Promise<void>;
  manualBanPlayer: (draft: ManualBanDraft) => Promise<BanRecord>;
  updateBanRecord: (banId: string, draft: BanRecordUpdateDraft) => Promise<BanRecord>;
  revokeBanRecord: (banId: string) => Promise<BanRecord>;
  deleteBanRecord: (banId: string) => Promise<void>;
  approvePlayer: (playerId: string, note?: string) => Promise<void>;
  rejectPlayer: (playerId: string, note?: string) => Promise<void>;
  manualAddPlayer: (draft: ManualWhitelistDraft) => Promise<WhitelistPlayer>;
  simulateApplication: (draft: ApplicationDraft) => Promise<WhitelistPlayer>;
}

const AppStoreContext = createContext<AppStoreContextValue | null>(null);

const clone = <T,>(value: T): T => structuredClone(value);
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const normalizeText = (value?: string) => value?.trim() || undefined;
const normalizeServer = (server: Server, fallback?: Partial<Server>): Server => ({
  ...server,
  whitelistEnabled: server.whitelistEnabled ?? fallback?.whitelistEnabled ?? false,
  entryVerificationEnabled: server.entryVerificationEnabled ?? fallback?.entryVerificationEnabled ?? false,
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

const getInitialWebsiteUserState = (): WebsiteUserState => {
  if (typeof window === 'undefined') {
    return clone(initialWebsiteUserState);
  }

  const storedState = window.localStorage.getItem(WEBSITE_USER_STORAGE_KEY);

  if (!storedState) {
    return clone(initialWebsiteUserState);
  }

  try {
    const parsedState = JSON.parse(storedState) as WebsiteUserState;

    if (!Array.isArray(parsedState.admins) || !parsedState.admins.length) {
      return clone(initialWebsiteUserState);
    }

    return parsedState;
  } catch {
    return clone(initialWebsiteUserState);
  }
};

const getInitialOperationLogs = (): OperationLog[] => {
  if (typeof window === 'undefined') {
    return clone(initialOperationLogs);
  }

  const storedLogs = window.localStorage.getItem(OPERATION_LOG_STORAGE_KEY);

  if (!storedLogs) {
    return clone(initialOperationLogs);
  }

  try {
    const parsedLogs = JSON.parse(storedLogs) as OperationLog[];
    return Array.isArray(parsedLogs) ? parsedLogs : clone(initialOperationLogs);
  } catch {
    return clone(initialOperationLogs);
  }
};

const persistWebsiteUsers = (state: WebsiteUserState) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(WEBSITE_USER_STORAGE_KEY, JSON.stringify(state));
};

const persistOperationLogs = (logs: OperationLog[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(OPERATION_LOG_STORAGE_KEY, JSON.stringify(logs));
};

export const AppStoreProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AppState>(initialState);
  const [theme, setThemeState] = useState<ThemeMode>(getPreferredTheme);
  const [apiError, setApiError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [websiteUserState, setWebsiteUserState] = useState<WebsiteUserState>(getInitialWebsiteUserState);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>(getInitialOperationLogs);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    persistWebsiteUsers(websiteUserState);
  }, [websiteUserState]);

  useEffect(() => {
    persistOperationLogs(operationLogs);
  }, [operationLogs]);

  const currentAdmin = useMemo(
    () =>
      websiteUserState.admins.find((admin) => admin.id === websiteUserState.currentAdminId) ??
      websiteUserState.admins[0] ??
      null,
    [websiteUserState],
  );

  useEffect(() => {
    if (!currentAdmin || currentAdmin.id === websiteUserState.currentAdminId) {
      return;
    }

    setWebsiteUserState((currentState) => ({
      ...currentState,
      currentAdminId: currentAdmin.id,
    }));
  }, [currentAdmin, websiteUserState.currentAdminId]);

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
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setBootstrapping(true);

      try {
        const [nextState, nextUserSummary] = await Promise.all([
          apiService.loadState(),
          apiService.getUsersSummary().catch(() => null),
        ]);

        if (!mounted) {
          return;
        }

        setState(nextState);
        setUserSummary(nextUserSummary);
        setApiError(null);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setApiError(error instanceof Error ? error.message : '接口初始化失败');
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

  const switchCurrentAdmin = (adminId: string) => {
    setWebsiteUserState((currentState) => {
      if (!currentState.admins.some((admin) => admin.id === adminId)) {
        return currentState;
      }

      return {
        ...currentState,
        currentAdminId: adminId,
      };
    });
  };

  const updateWebsiteAdmin = async (adminId: string, draft: WebsiteAdminUpdateDraft) => {
    if (!currentAdmin) {
      throw new Error('当前没有登录管理员');
    }

    const targetAdmin = websiteUserState.admins.find((admin) => admin.id === adminId);

    if (!targetAdmin) {
      throw new Error('未找到目标管理员');
    }

    const isSelfEdit = currentAdmin.id === adminId;
    const isSystemAdmin = currentAdmin.role === 'system_admin';

    if (!isSystemAdmin && !isSelfEdit) {
      throw new Error('普通管理员只能编辑自己的信息');
    }

    const nextUsername = draft.username.trim();
    const nextDisplayName = draft.displayName.trim();
    const nextEmail = normalizeText(draft.email);
    const nextNote = normalizeText(draft.note);
    const nextPassword = draft.password.trim() ? draft.password.trim() : targetAdmin.password;
    const nextRole = isSystemAdmin ? draft.role : targetAdmin.role;

    if (!nextUsername) {
      throw new Error('请输入用户名');
    }

    if (!nextDisplayName) {
      throw new Error('请输入管理员名称');
    }

    if (nextPassword.length < 6) {
      throw new Error('密码至少需要 6 位');
    }

    const hasDuplicateUsername = websiteUserState.admins.some(
      (admin) => admin.id !== adminId && admin.username.toLowerCase() === nextUsername.toLowerCase(),
    );

    if (hasDuplicateUsername) {
      throw new Error('用户名已存在，请更换其他用户名');
    }

    const remainingSystemAdminCount = websiteUserState.admins.filter(
      (admin) => admin.id !== adminId && admin.role === 'system_admin',
    ).length;

    if (targetAdmin.role === 'system_admin' && nextRole !== 'system_admin' && remainingSystemAdminCount === 0) {
      throw new Error('系统中至少需要保留一名系统管理员');
    }

    const updatedAdmin: WebsiteAdmin = {
      ...targetAdmin,
      username: nextUsername,
      displayName: nextDisplayName,
      password: nextPassword,
      email: nextEmail,
      note: nextNote,
      role: nextRole,
      updatedAt: new Date().toISOString(),
    };

    setWebsiteUserState((currentState) => ({
      ...currentState,
      admins: currentState.admins.map((admin) => (admin.id === adminId ? updatedAdmin : admin)),
      currentAdminId: isSelfEdit ? updatedAdmin.id : currentState.currentAdminId,
    }));

    appendOperationLog(
      'admin_profile_updated',
      isSelfEdit
        ? `修改了自己的管理员资料，当前用户名为 ${updatedAdmin.username}。`
        : `修改了管理员 ${targetAdmin.displayName} 的资料，当前用户名为 ${updatedAdmin.username}。`,
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

  const addServer = async (communityId: string, draft: ServerDraft) => {
    const createdServer = await apiService.createServer(communityId, draft);
    const server = normalizeServer(createdServer, {
      whitelistEnabled: draft.whitelistEnabled,
      entryVerificationEnabled: draft.entryVerificationEnabled,
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
    const updatedServer = await apiService.updateServer(communityId, serverId, draft);
    const server = normalizeServer(updatedServer, {
      ...currentServer,
      whitelistEnabled: draft.whitelistEnabled,
      entryVerificationEnabled: draft.entryVerificationEnabled,
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

    const updatedBan = await apiService.updateBanRecord(banId, {
      ...draft,
      nickname: normalizeText(draft.nickname),
      steamIdentifier: draft.steamIdentifier.trim(),
      ipAddress: normalizeText(draft.ipAddress),
      reason: draft.reason.trim(),
      serverName: normalizeText(draft.serverName),
      communityName: normalizeText(draft.communityName),
    }, getBanOperatorSnapshot(currentAdmin));

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
      `解除了玩家 ${revokedBan.nickname ?? revokedBan.steamId} 的封禁，原封禁属性为${banTypeLabelMap[revokedBan.banType]}。`,
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

    await apiService.updateWhitelistStatus(playerId, status, note);

    setState((currentState) => ({
      ...currentState,
      whitelist: currentState.whitelist.map((whitelistPlayer) => {
        if (whitelistPlayer.id !== playerId) {
          return whitelistPlayer;
        }

        return {
          ...whitelistPlayer,
          status,
          note: note ?? whitelistPlayer.note,
          reviewedAt: new Date().toISOString(),
        };
      }),
    }));
    setApiError(null);

    appendOperationLog(
      status === 'approved' ? 'whitelist_approved' : 'whitelist_rejected',
      `${status === 'approved' ? '审核通过' : '审核拒绝'}玩家 ${player?.nickname ?? playerId} 的白名单申请。${note ? ` 备注：${note}` : ''}`,
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

  const simulateApplication = async (draft: ApplicationDraft) => {
    const player = await apiService.createApplication(draft);

    setState((currentState) => ({
      ...currentState,
      whitelist: [player, ...currentState.whitelist],
    }));
    setApiError(null);

    appendOperationLog('whitelist_application_simulated', `模拟提交了玩家 ${player.nickname} 的白名单申请。`);

    return player;
  };

  const value = useMemo<AppStoreContextValue>(
    () => ({
      state,
      theme,
      apiMode: apiService.mode,
      apiError,
      bootstrapping,
      userSummary,
      websiteUsers: websiteUserState.admins,
      currentAdmin,
      operationLogs,
      setTheme,
      refreshState,
      switchCurrentAdmin,
      updateWebsiteAdmin,
      addCommunity,
      addServer,
      updateServer,
      kickServerPlayer,
      banServerPlayer,
      manualBanPlayer,
      updateBanRecord,
      revokeBanRecord,
      deleteBanRecord,
      approvePlayer,
      rejectPlayer,
      manualAddPlayer,
      simulateApplication,
    }),
    [apiError, bootstrapping, currentAdmin, operationLogs, state, theme, userSummary, websiteUserState.admins],
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
