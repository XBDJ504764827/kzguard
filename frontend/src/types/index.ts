export type ThemeMode = 'light' | 'dark';
export type ApiMode = 'mock' | 'http';
export type BanType = 'steam_account' | 'ip';
export type BanSource = 'manual' | 'server_action';
export type BanStatus = 'active' | 'revoked';

export interface ServerPlayer {
  id: string;
  nickname: string;
  steamId: string;
  ipAddress: string;
  connectedAt: string;
  ping: number;
}

export interface Server {
  id: string;
  name: string;
  ip: string;
  port: number;
  rconPassword: string;
  rconVerifiedAt: string;
  whitelistEnabled: boolean;
  entryVerificationEnabled: boolean;
  onlinePlayers: ServerPlayer[];
}

export interface Community {
  id: string;
  name: string;
  createdAt: string;
  servers: Server[];
}

export type WhitelistStatus = 'approved' | 'pending' | 'rejected';
export type WhitelistSource = 'application' | 'manual';

export interface WhitelistPlayer {
  id: string;
  nickname: string;
  steamId: string;
  contact?: string;
  note?: string;
  status: WhitelistStatus;
  source: WhitelistSource;
  appliedAt: string;
  reviewedAt?: string;
}

export type WebsiteAdminRole = 'system_admin' | 'normal_admin';

export interface BanRecordOperator {
  id: string;
  name: string;
  role: WebsiteAdminRole;
}

export interface BanRecord {
  id: string;
  nickname?: string;
  banType: BanType;
  status: BanStatus;
  steamIdentifier: string;
  steamId64: string;
  steamId: string;
  steamId3: string;
  ipAddress?: string;
  reason: string;
  durationSeconds?: number;
  bannedAt: string;
  serverName: string;
  communityName?: string;
  operatorId: string;
  operatorName: string;
  operatorRole: WebsiteAdminRole;
  source: BanSource;
  updatedAt?: string;
  revokedAt?: string;
  revokedByOperatorId?: string;
  revokedByOperatorName?: string;
  revokedByOperatorRole?: WebsiteAdminRole;
}

export interface AppState {
  communities: Community[];
  whitelist: WhitelistPlayer[];
  bans: BanRecord[];
}

export interface ServerDraft {
  name: string;
  ip: string;
  port: number;
  rconPassword: string;
  whitelistEnabled: boolean;
  entryVerificationEnabled: boolean;
}

export interface ServerSettingsDraft {
  ip: string;
  port: number;
  rconPassword: string;
  whitelistEnabled: boolean;
  entryVerificationEnabled: boolean;
}

export interface BanServerPlayerDraft {
  banType: BanType;
  reason: string;
  durationSeconds?: number;
  ipAddress?: string;
}

export interface ManualBanDraft {
  nickname?: string;
  banType: BanType;
  steamIdentifier: string;
  ipAddress?: string;
  durationSeconds?: number;
  reason: string;
}

export interface BanRecordUpdateDraft {
  nickname?: string;
  banType: BanType;
  steamIdentifier: string;
  ipAddress?: string;
  durationSeconds?: number;
  reason: string;
  serverName?: string;
  communityName?: string;
}

export interface ManualWhitelistDraft {
  nickname: string;
  steamId: string;
  contact?: string;
  note?: string;
  status: 'approved' | 'rejected';
}

export interface ApplicationDraft {
  nickname: string;
  steamId: string;
  contact?: string;
  note?: string;
}

export interface WebsiteAdmin {
  id: string;
  username: string;
  displayName: string;
  role: WebsiteAdminRole;
  password: string;
  email?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteUserState {
  currentAdminId: string;
  admins: WebsiteAdmin[];
}

export interface WebsiteAdminUpdateDraft {
  username: string;
  displayName: string;
  password: string;
  email?: string;
  note?: string;
  role: WebsiteAdminRole;
}

export type OperationLogAction =
  | 'community_created'
  | 'server_created'
  | 'server_updated'
  | 'server_player_kicked'
  | 'server_player_banned'
  | 'ban_record_manual_created'
  | 'ban_record_updated'
  | 'ban_record_revoked'
  | 'ban_record_deleted'
  | 'whitelist_approved'
  | 'whitelist_rejected'
  | 'whitelist_manual_added'
  | 'whitelist_application_simulated'
  | 'admin_profile_updated';

export interface OperationLog {
  id: string;
  createdAt: string;
  operatorId: string;
  operatorName: string;
  operatorRole: WebsiteAdminRole;
  action: OperationLogAction;
  detail: string;
}

export interface UserSummary {
  enabled: boolean;
  message: string;
  plannedModules: string[];
}
