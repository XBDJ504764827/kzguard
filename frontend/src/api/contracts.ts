import type {
  ApiMode,
  AppState,
  ApplicationDraft,
  Community,
  ManualWhitelistDraft,
  Server,
  ServerDraft,
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
  createApplication: (draft: ApplicationDraft) => Promise<WhitelistPlayer>;
  createManualWhitelistEntry: (draft: ManualWhitelistDraft) => Promise<WhitelistPlayer>;
  updateWhitelistStatus: (playerId: string, status: 'approved' | 'rejected', note?: string) => Promise<void>;
  getUsersSummary: () => Promise<UserSummary>;
}
