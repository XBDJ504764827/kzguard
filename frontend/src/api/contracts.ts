import type {
  ApiMode,
  AppState,
  ApplicationDraft,
  AuthSession,
  BanRecord,
  BanRecordOperator,
  BanRecordUpdateDraft,
  BanServerPlayerDraft,
  Community,
  LoginDraft,
  ManualBanDraft,
  ManualWhitelistDraft,
  OperationLog,
  Server,
  ServerDraft,
  ServerPlayersSnapshot,
  ServerRconVerificationResult,
  ServerSettingsDraft,
  UserSummary,
  WebsiteAdmin,
  WebsiteAdminCreateDraft,
  WebsiteAdminUpdateDraft,
  WhitelistPlayer,
} from '../types';

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

export interface KzGuardApi {
  mode: ApiMode;
  login: (draft: LoginDraft) => Promise<AuthSession>;
  getAuthSession: () => Promise<WebsiteAdmin>;
  logout: () => Promise<void>;
  loadState: () => Promise<AppState>;
  listWebsiteAdmins: () => Promise<WebsiteAdmin[]>;
  createWebsiteAdmin: (draft: WebsiteAdminCreateDraft) => Promise<WebsiteAdmin>;
  updateWebsiteAdmin: (adminId: string, draft: WebsiteAdminUpdateDraft) => Promise<WebsiteAdmin>;
  listOperationLogs: () => Promise<OperationLog[]>;
  createCommunity: (name: string) => Promise<Community>;
  updateCommunity: (communityId: string, name: string) => Promise<Community>;
  deleteCommunity: (communityId: string) => Promise<void>;
  verifyServerRcon: (communityId: string, draft: ServerDraft) => Promise<ServerRconVerificationResult>;
  createServer: (communityId: string, draft: ServerDraft) => Promise<Server>;
  updateServer: (communityId: string, serverId: string, draft: ServerSettingsDraft) => Promise<Server>;
  deleteServer: (communityId: string, serverId: string) => Promise<void>;
  listServerPlayers: (communityId: string, serverId: string) => Promise<ServerPlayersSnapshot>;
  kickServerPlayer: (communityId: string, serverId: string, playerId: string, reason: string) => Promise<void>;
  banServerPlayer: (
    communityId: string,
    serverId: string,
    playerId: string,
    draft: BanServerPlayerDraft,
    operator: BanRecordOperator,
  ) => Promise<BanRecord>;
  createManualBanEntry: (draft: ManualBanDraft, operator: BanRecordOperator) => Promise<BanRecord>;
  updateBanRecord: (banId: string, draft: BanRecordUpdateDraft, operator: BanRecordOperator) => Promise<BanRecord>;
  revokeBanRecord: (banId: string, operator: BanRecordOperator) => Promise<BanRecord>;
  deleteBanRecord: (banId: string, operator: BanRecordOperator) => Promise<void>;
  createApplication: (draft: ApplicationDraft) => Promise<WhitelistPlayer>;
  createManualWhitelistEntry: (draft: ManualWhitelistDraft) => Promise<WhitelistPlayer>;
  updateWhitelistStatus: (playerId: string, status: 'approved' | 'rejected', note?: string) => Promise<void>;
  getUsersSummary: () => Promise<UserSummary>;
}
