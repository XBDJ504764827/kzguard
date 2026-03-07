import { initialState } from '../../data/mockData';
import type {
  AppState,
  ApplicationDraft,
  BanRecord,
  BanRecordOperator,
  BanRecordUpdateDraft,
  BanServerPlayerDraft,
  Community,
  ManualBanDraft,
  ManualWhitelistDraft,
  Server,
  ServerDraft,
  ServerSettingsDraft,
  UserSummary,
  WhitelistPlayer,
} from '../../types';
import { resolveSteamIdentifiers } from '../../utils/steam';
import type { KzGuardApi } from '../contracts';

const STORAGE_KEY = 'kzguard-admin-state-v1';

const clone = <T,>(value: T): T => structuredClone(value);

const initialServerLookup = new Map(
  initialState.communities.flatMap((community) => community.servers.map((server) => [server.id, server] as const)),
);

const normalizeBanRecord = (ban: BanRecord): BanRecord => {
  const identifiers = resolveSteamIdentifiers(ban.steamIdentifier ?? ban.steamId ?? ban.steamId64 ?? '');

  return {
    ...ban,
    nickname: ban.nickname?.trim() || undefined,
    banType: ban.banType ?? 'steam_account',
    status: ban.status ?? 'active',
    steamIdentifier: ban.steamIdentifier?.trim() || ban.steamId || ban.steamId64 || '',
    steamId64: ban.steamId64 || identifiers.steamId64,
    steamId: ban.steamId || identifiers.steamId,
    steamId3: ban.steamId3 || identifiers.steamId3,
    ipAddress: ban.ipAddress?.trim() || undefined,
    reason: ban.reason?.trim() || '未填写原因',
    durationSeconds: ban.durationSeconds,
    bannedAt: ban.bannedAt || new Date().toISOString(),
    serverName: ban.serverName || '手动录入（未关联服务器）',
    communityName: ban.communityName?.trim() || undefined,
    operatorId: ban.operatorId || 'admin_unknown',
    operatorName: ban.operatorName || '未知管理员',
    operatorRole: ban.operatorRole || 'normal_admin',
    source: ban.source || 'manual',
    updatedAt: ban.updatedAt,
    revokedAt: ban.revokedAt,
    revokedByOperatorId: ban.revokedByOperatorId,
    revokedByOperatorName: ban.revokedByOperatorName,
    revokedByOperatorRole: ban.revokedByOperatorRole,
  };
};

const normalizeState = (state: AppState): AppState => ({
  communities: state.communities.map((community) => ({
    ...community,
    servers: community.servers.map((server) => {
      const initialServer = initialServerLookup.get(server.id);

      return {
        ...server,
        whitelistEnabled: server.whitelistEnabled ?? initialServer?.whitelistEnabled ?? false,
        entryVerificationEnabled: server.entryVerificationEnabled ?? initialServer?.entryVerificationEnabled ?? false,
        onlinePlayers: (Array.isArray(server.onlinePlayers) ? server.onlinePlayers : clone(initialServer?.onlinePlayers ?? [])).map(
          (player) => ({
            ...player,
            ipAddress: player.ipAddress ?? '未知 IP',
          }),
        ),
      };
    }),
  })),
  whitelist: Array.isArray(state.whitelist) ? state.whitelist : clone(initialState.whitelist),
  bans: Array.isArray(state.bans) ? state.bans.map(normalizeBanRecord) : [],
});

const readState = (): AppState => {
  if (typeof window === 'undefined') {
    return clone(initialState);
  }

  const storedState = window.localStorage.getItem(STORAGE_KEY);

  if (!storedState) {
    return clone(initialState);
  }

  try {
    return normalizeState(JSON.parse(storedState) as AppState);
  } catch {
    return clone(initialState);
  }
};

const writeState = (state: AppState) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const updateState = (updater: (currentState: AppState) => AppState) => {
  const nextState = updater(readState());
  writeState(nextState);
  return nextState;
};

const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const buildBanRecord = (params: {
  nickname?: string;
  banType: BanServerPlayerDraft['banType'];
  steamIdentifier: string;
  ipAddress?: string;
  reason: string;
  durationSeconds?: number;
  serverName: string;
  communityName?: string;
  operator: BanRecordOperator;
  source: BanRecord['source'];
}): BanRecord => {
  const identifiers = resolveSteamIdentifiers(params.steamIdentifier);

  return {
    id: createId('ban'),
    nickname: params.nickname?.trim() || undefined,
    banType: params.banType,
    status: 'active',
    steamIdentifier: params.steamIdentifier.trim(),
    steamId64: identifiers.steamId64,
    steamId: identifiers.steamId,
    steamId3: identifiers.steamId3,
    ipAddress: params.ipAddress?.trim() || undefined,
    reason: params.reason.trim(),
    durationSeconds: params.durationSeconds,
    bannedAt: new Date().toISOString(),
    serverName: params.serverName,
    communityName: params.communityName?.trim() || undefined,
    operatorId: params.operator.id,
    operatorName: params.operator.name,
    operatorRole: params.operator.role,
    source: params.source,
    updatedAt: new Date().toISOString(),
  };
};

const usersSummary: UserSummary = {
  enabled: false,
  message: '网站用户模块待开发',
  plannedModules: [
    '网站管理员账号体系',
    '社区负责人角色权限',
    '玩家个人中心与白名单申请入口',
    '登录、鉴权与操作日志',
  ],
};

export const mockApi: KzGuardApi = {
  mode: 'mock',
  async loadState() {
    return readState();
  },
  async createCommunity(name) {
    const community: Community = {
      id: createId('community'),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      servers: [],
    };

    updateState((state) => ({
      ...state,
      communities: [community, ...state.communities],
    }));

    return community;
  },
  async createServer(communityId, draft) {
    const server: Server = {
      id: createId('server'),
      name: draft.name.trim(),
      ip: draft.ip.trim(),
      port: draft.port,
      rconPassword: draft.rconPassword,
      rconVerifiedAt: new Date().toISOString(),
      whitelistEnabled: draft.whitelistEnabled,
      entryVerificationEnabled: draft.entryVerificationEnabled,
      onlinePlayers: [],
    };

    updateState((state) => ({
      ...state,
      communities: state.communities.map((community) => {
        if (community.id !== communityId) {
          return community;
        }

        return {
          ...community,
          servers: [server, ...community.servers],
        };
      }),
    }));

    return server;
  },
  async updateServer(communityId, serverId, draft) {
    const now = new Date().toISOString();
    const currentServer = readState().communities
      .find((community) => community.id === communityId)
      ?.servers.find((server) => server.id === serverId);

    const server: Server = {
      id: currentServer?.id ?? serverId,
      name: currentServer?.name ?? '未命名服务器',
      ip: draft.ip.trim(),
      port: draft.port,
      rconPassword: draft.rconPassword,
      rconVerifiedAt: now,
      whitelistEnabled: draft.whitelistEnabled,
      entryVerificationEnabled: draft.entryVerificationEnabled,
      onlinePlayers: currentServer?.onlinePlayers ?? [],
    };

    updateState((state) => ({
      ...state,
      communities: state.communities.map((community) => {
        if (community.id !== communityId) {
          return community;
        }

        return {
          ...community,
          servers: community.servers.map((item) => (item.id === serverId ? server : item)),
        };
      }),
    }));

    return server;
  },
  async kickServerPlayer(communityId, serverId, playerId) {
    updateState((state) => ({
      ...state,
      communities: state.communities.map((community) => {
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
              onlinePlayers: (server.onlinePlayers ?? []).filter((player) => player.id !== playerId),
            };
          }),
        };
      }),
    }));
  },
  async banServerPlayer(communityId, serverId, playerId, draft, operator) {
    const currentState = readState();
    const community = currentState.communities.find((item) => item.id === communityId);
    const server = community?.servers.find((item) => item.id === serverId);
    const player = server?.onlinePlayers.find((item) => item.id === playerId);

    if (!community || !server || !player) {
      throw new Error('未找到要封禁的玩家或服务器');
    }

    const ban = buildBanRecord({
      nickname: player.nickname,
      banType: draft.banType,
      steamIdentifier: player.steamId,
      ipAddress: draft.ipAddress ?? player.ipAddress,
      reason: draft.reason,
      durationSeconds: draft.durationSeconds,
      serverName: server.name,
      communityName: community.name,
      operator,
      source: 'server_action',
    });

    updateState((state) => ({
      ...state,
      communities: state.communities.map((communityItem) => {
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
              onlinePlayers: (serverItem.onlinePlayers ?? []).filter((onlinePlayer) => onlinePlayer.id !== playerId),
            };
          }),
        };
      }),
      bans: [ban, ...state.bans],
    }));

    return ban;
  },
  async createManualBanEntry(draft: ManualBanDraft, operator: BanRecordOperator) {
    const ban = buildBanRecord({
      nickname: draft.nickname,
      banType: draft.banType,
      steamIdentifier: draft.steamIdentifier,
      ipAddress: draft.ipAddress,
      reason: draft.reason,
      durationSeconds: draft.durationSeconds,
      serverName: '手动录入（未关联服务器）',
      operator,
      source: 'manual',
    });

    updateState((state) => ({
      ...state,
      bans: [ban, ...state.bans],
    }));

    return ban;
  },
  async updateBanRecord(banId: string, draft: BanRecordUpdateDraft) {
    const currentBan = readState().bans.find((item) => item.id === banId);

    if (!currentBan) {
      throw new Error('未找到要编辑的封禁记录');
    }

    const identifiers = resolveSteamIdentifiers(draft.steamIdentifier);
    const updatedBan = normalizeBanRecord({
      ...currentBan,
      nickname: draft.nickname?.trim() || undefined,
      banType: draft.banType,
      steamIdentifier: draft.steamIdentifier.trim(),
      steamId64: identifiers.steamId64,
      steamId: identifiers.steamId,
      steamId3: identifiers.steamId3,
      ipAddress: draft.ipAddress?.trim() || undefined,
      reason: draft.reason.trim(),
      durationSeconds: draft.durationSeconds,
      serverName: draft.serverName?.trim() || currentBan.serverName,
      communityName: draft.communityName?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });

    updateState((state) => ({
      ...state,
      bans: state.bans.map((ban) => (ban.id === banId ? updatedBan : ban)),
    }));

    return updatedBan;
  },
  async revokeBanRecord(banId: string, operator: BanRecordOperator) {
    const currentBan = readState().bans.find((item) => item.id === banId);

    if (!currentBan) {
      throw new Error('未找到要解除的封禁记录');
    }

    if (currentBan.status === 'revoked') {
      throw new Error('该封禁记录已解除');
    }

    const now = new Date().toISOString();
    const revokedBan = normalizeBanRecord({
      ...currentBan,
      status: 'revoked',
      updatedAt: now,
      revokedAt: now,
      revokedByOperatorId: operator.id,
      revokedByOperatorName: operator.name,
      revokedByOperatorRole: operator.role,
    });

    updateState((state) => ({
      ...state,
      bans: state.bans.map((ban) => (ban.id === banId ? revokedBan : ban)),
    }));

    return revokedBan;
  },
  async deleteBanRecord(banId: string) {
    const exists = readState().bans.some((item) => item.id === banId);

    if (!exists) {
      throw new Error('未找到要删除的封禁记录');
    }

    updateState((state) => ({
      ...state,
      bans: state.bans.filter((ban) => ban.id !== banId),
    }));
  },
  async createApplication(draft) {
    const player: WhitelistPlayer = {
      id: createId('player'),
      nickname: draft.nickname.trim(),
      steamId: draft.steamId.trim(),
      contact: draft.contact?.trim() || undefined,
      note: draft.note?.trim() || undefined,
      status: 'pending',
      source: 'application',
      appliedAt: new Date().toISOString(),
    };

    updateState((state) => ({
      ...state,
      whitelist: [player, ...state.whitelist],
    }));

    return player;
  },
  async createManualWhitelistEntry(draft) {
    const now = new Date().toISOString();
    const player: WhitelistPlayer = {
      id: createId('player'),
      nickname: draft.nickname.trim(),
      steamId: draft.steamId.trim(),
      contact: draft.contact?.trim() || undefined,
      note: draft.note?.trim() || undefined,
      status: draft.status,
      source: 'manual',
      appliedAt: now,
      reviewedAt: now,
    };

    updateState((state) => ({
      ...state,
      whitelist: [player, ...state.whitelist],
    }));

    return player;
  },
  async updateWhitelistStatus(playerId, status, note) {
    updateState((state) => ({
      ...state,
      whitelist: state.whitelist.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        return {
          ...player,
          status,
          note: note ?? player.note,
          reviewedAt: new Date().toISOString(),
        };
      }),
    }));
  },
  async getUsersSummary() {
    return usersSummary;
  },
};
