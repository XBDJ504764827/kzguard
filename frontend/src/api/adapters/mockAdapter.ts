import { initialState } from '../../data/mockData';
import type {
  AppState,
  ApplicationDraft,
  Community,
  ManualWhitelistDraft,
  Server,
  ServerDraft,
  UserSummary,
  WhitelistPlayer,
} from '../../types';
import type { KzGuardApi } from '../contracts';

const STORAGE_KEY = 'kzguard-admin-state-v1';

const clone = <T,>(value: T): T => structuredClone(value);

const readState = (): AppState => {
  if (typeof window === 'undefined') {
    return clone(initialState);
  }

  const storedState = window.localStorage.getItem(STORAGE_KEY);

  if (!storedState) {
    return clone(initialState);
  }

  try {
    return JSON.parse(storedState) as AppState;
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
