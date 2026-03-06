import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { apiService } from '../api';
import { initialWebsiteUserState } from '../data/adminMockData';
import { initialState } from '../data/mockData';
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
  WebsiteAdmin,
  WebsiteAdminUpdateDraft,
  WebsiteUserState,
  WhitelistPlayer,
} from '../types';
import { applyTheme, getPreferredTheme, persistTheme } from '../utils/theme';

const WEBSITE_USER_STORAGE_KEY = 'kzguard-website-user-state-v1';

interface AppStoreContextValue {
  state: AppState;
  theme: ThemeMode;
  apiMode: ApiMode;
  apiError: string | null;
  bootstrapping: boolean;
  userSummary: UserSummary | null;
  websiteUsers: WebsiteAdmin[];
  currentAdmin: WebsiteAdmin | null;
  setTheme: (theme: ThemeMode) => void;
  refreshState: () => Promise<void>;
  switchCurrentAdmin: (adminId: string) => void;
  updateWebsiteAdmin: (adminId: string, draft: WebsiteAdminUpdateDraft) => Promise<WebsiteAdmin>;
  addCommunity: (name: string) => Promise<Community>;
  addServer: (communityId: string, draft: ServerDraft) => Promise<Server>;
  approvePlayer: (playerId: string, note?: string) => Promise<void>;
  rejectPlayer: (playerId: string, note?: string) => Promise<void>;
  manualAddPlayer: (draft: ManualWhitelistDraft) => Promise<WhitelistPlayer>;
  simulateApplication: (draft: ApplicationDraft) => Promise<WhitelistPlayer>;
}

const AppStoreContext = createContext<AppStoreContextValue | null>(null);

const clone = <T,>(value: T): T => structuredClone(value);

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

const persistWebsiteUsers = (state: WebsiteUserState) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(WEBSITE_USER_STORAGE_KEY, JSON.stringify(state));
};

const normalizeText = (value?: string) => value?.trim() || undefined;

export const AppStoreProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AppState>(initialState);
  const [theme, setThemeState] = useState<ThemeMode>(getPreferredTheme);
  const [apiError, setApiError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [websiteUserState, setWebsiteUserState] = useState<WebsiteUserState>(getInitialWebsiteUserState);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    persistWebsiteUsers(websiteUserState);
  }, [websiteUserState]);

  const currentAdmin = useMemo(
    () =>
      websiteUserState.admins.find((admin) => admin.id === websiteUserState.currentAdminId) ??
      websiteUserState.admins[0] ??
      null,
    [websiteUserState],
  );

  useEffect(() => {
    if (!currentAdmin) {
      return;
    }

    if (currentAdmin.id !== websiteUserState.currentAdminId) {
      setWebsiteUserState((currentState) => ({
        ...currentState,
        currentAdminId: currentAdmin.id,
      }));
    }
  }, [currentAdmin, websiteUserState.currentAdminId]);

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

    return updatedAdmin;
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
      websiteUsers: websiteUserState.admins,
      currentAdmin,
      setTheme,
      refreshState,
      switchCurrentAdmin,
      updateWebsiteAdmin,
      addCommunity,
      addServer,
      approvePlayer,
      rejectPlayer,
      manualAddPlayer,
      simulateApplication,
    }),
    [apiError, bootstrapping, currentAdmin, state, theme, userSummary, websiteUserState.admins],
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
