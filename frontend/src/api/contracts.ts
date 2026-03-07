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
  Server,
  ServerDraft,
  ServerSettingsDraft,
  UserSummary,
  WhitelistPlayer,
} from '../types';

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

export interface KzGuardApi {
  mode: ApiMode;
  loadState: () => Promise<AppState>;
  createCommunity: (name: string) => Promise<Community>;
  createServer: (communityId: string, draft: ServerDraft) => Promise<Server>;
  updateServer: (communityId: string, serverId: string, draft: ServerSettingsDraft) => Promise<Server>;
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
