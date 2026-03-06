import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { initialState } from '../data/mockData';
import { apiService } from '../api';
import type {
  ApiMode,
  AppState,
  ApplicationDraft,
  Community,
  ManualWhitelistDraft,
  Server,
  ServerDraft,
  ThemeMode,
  UserSummary,
  WhitelistPlayer,
} from '../types';
import { applyTheme, getPreferredTheme, persistTheme } from '../utils/theme';

interface AppStoreContextValue {
  state: AppState;
  theme: ThemeMode;
  apiMode: ApiMode;
  apiError: string | null;
  bootstrapping: boolean;
  userSummary: UserSummary | null;
  setTheme: (theme: ThemeMode) => void;
  refreshState: () => Promise<void>;
  addCommunity: (name: string) => Promise<Community>;
  addServer: (communityId: string, draft: ServerDraft) => Promise<Server>;
  approvePlayer: (playerId: string, note?: string) => Promise<void>;
  rejectPlayer: (playerId: string, note?: string) => Promise<void>;
  manualAddPlayer: (draft: ManualWhitelistDraft) => Promise<WhitelistPlayer>;
  simulateApplication: (draft: ApplicationDraft) => Promise<WhitelistPlayer>;
}

const AppStoreContext = createContext<AppStoreContextValue | null>(null);

export const AppStoreProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AppState>(initialState);
  const [theme, setThemeState] = useState<ThemeMode>(getPreferredTheme);
  const [apiError, setApiError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

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

  const addCommunity = async (name: string) => {
    const community = await apiService.createCommunity(name);

    setState((currentState) => ({
      ...currentState,
      communities: [community, ...currentState.communities],
    }));
    setApiError(null);

    return community;
  };

  const addServer = async (communityId: string, draft: ServerDraft) => {
    const server = await apiService.createServer(communityId, draft);

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
    setApiError(null);

    return server;
  };

  const updatePlayerStatus = async (playerId: string, status: 'approved' | 'rejected', note?: string) => {
    await apiService.updateWhitelistStatus(playerId, status, note);

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
    setApiError(null);
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

    return player;
  };

  const simulateApplication = async (draft: ApplicationDraft) => {
    const player = await apiService.createApplication(draft);

    setState((currentState) => ({
      ...currentState,
      whitelist: [player, ...currentState.whitelist],
    }));
    setApiError(null);

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
      setTheme,
      refreshState,
      addCommunity,
      addServer,
      approvePlayer,
      rejectPlayer,
      manualAddPlayer,
      simulateApplication,
    }),
    [apiError, bootstrapping, state, theme, userSummary],
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
