import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { initialState } from '../data/mockData';
import type {
  AppState,
  ApplicationDraft,
  Community,
  ManualWhitelistDraft,
  Server,
  ServerDraft,
  ThemeMode,
  WhitelistPlayer,
} from '../types';
import { applyTheme, getPreferredTheme, persistTheme } from '../utils/theme';

const APP_STORAGE_KEY = 'kzguard-admin-state-v1';

interface AppStoreContextValue {
  state: AppState;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  addCommunity: (name: string) => Community;
  addServer: (communityId: string, draft: ServerDraft) => Server;
  approvePlayer: (playerId: string, note?: string) => void;
  rejectPlayer: (playerId: string, note?: string) => void;
  manualAddPlayer: (draft: ManualWhitelistDraft) => WhitelistPlayer;
  simulateApplication: (draft: ApplicationDraft) => WhitelistPlayer;
}

const AppStoreContext = createContext<AppStoreContextValue | null>(null);

const createId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const getInitialState = (): AppState => {
  if (typeof window === 'undefined') {
    return initialState;
  }

  const storedState = window.localStorage.getItem(APP_STORAGE_KEY);

  if (!storedState) {
    return initialState;
  }

  try {
    const parsedState = JSON.parse(storedState) as AppState;
    return parsedState;
  } catch {
    return initialState;
  }
};

export const AppStoreProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AppState>(getInitialState);
  const [theme, setThemeState] = useState<ThemeMode>(getPreferredTheme);

  useEffect(() => {
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
  };

  const addCommunity = (name: string) => {
    const community: Community = {
      id: createId('community'),
      name,
      createdAt: new Date().toISOString(),
      servers: [],
    };

    setState((currentState) => ({
      ...currentState,
      communities: [community, ...currentState.communities],
    }));

    return community;
  };

  const addServer = (communityId: string, draft: ServerDraft) => {
    const server: Server = {
      id: createId('server'),
      name: draft.name,
      ip: draft.ip,
      port: draft.port,
      rconPassword: draft.rconPassword,
      rconVerifiedAt: new Date().toISOString(),
    };

    setState((currentState) => ({
      ...currentState,
      communities: currentState.communities.map((community) => {
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
  };

  const updatePlayerStatus = (playerId: string, status: 'approved' | 'rejected', note?: string) => {
    setState((currentState) => ({
      ...currentState,
      whitelist: currentState.whitelist.map((player) => {
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
  };

  const approvePlayer = (playerId: string, note?: string) => {
    updatePlayerStatus(playerId, 'approved', note);
  };

  const rejectPlayer = (playerId: string, note?: string) => {
    updatePlayerStatus(playerId, 'rejected', note);
  };

  const manualAddPlayer = (draft: ManualWhitelistDraft) => {
    const player: WhitelistPlayer = {
      id: createId('player'),
      nickname: draft.nickname,
      steamId: draft.steamId,
      contact: draft.contact,
      note: draft.note,
      status: draft.status,
      source: 'manual',
      appliedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
    };

    setState((currentState) => ({
      ...currentState,
      whitelist: [player, ...currentState.whitelist],
    }));

    return player;
  };

  const simulateApplication = (draft: ApplicationDraft) => {
    const player: WhitelistPlayer = {
      id: createId('player'),
      nickname: draft.nickname,
      steamId: draft.steamId,
      contact: draft.contact,
      note: draft.note,
      status: 'pending',
      source: 'application',
      appliedAt: new Date().toISOString(),
    };

    setState((currentState) => ({
      ...currentState,
      whitelist: [player, ...currentState.whitelist],
    }));

    return player;
  };

  const value = useMemo<AppStoreContextValue>(
    () => ({
      state,
      theme,
      setTheme,
      addCommunity,
      addServer,
      approvePlayer,
      rejectPlayer,
      manualAddPlayer,
      simulateApplication,
    }),
    [state, theme],
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
