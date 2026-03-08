export type ThemeMode = 'light' | 'dark';
export type ApiMode = 'mock' | 'http';
export type BanType = 'steam_account' | 'ip';
export type BanSource = 'manual' | 'server_action';
export type BanStatus = 'active' | 'revoked';
export type PublicBanStatusFilter = BanStatus | 'all';
export type PublicWhitelistStatusFilter = WhitelistStatus | 'all';

export interface LoginDraft {
  username: string;
  password: string;
}

export interface ServerPlayer {
  id: string;
  userId: number;
  nickname: string;
  steamId: string;
  steamId64?: string;
  steamId3?: string;
  ipAddress: string;
  connectedAt: string;
  ping: number;
  lastReportedAt?: string;
}

export interface ServerPlayersSnapshot {
  serverId: string;
  reportedAt?: string;
  playerCount: number;
  players: ServerPlayer[];
}

export interface Server {
  id: string;
  name: string;
  ip: string;
  port: number;
  rconPassword: string;
  pluginToken: string;
  rconVerifiedAt: string;
  whitelistEnabled: boolean;
  entryVerificationEnabled: boolean;
  minEntryRating: number;
  minSteamLevel: number;
  playerReportedAt?: string;
  onlinePlayers: ServerPlayer[];
}

export interface Community {
  id: string;
  name: string;
  createdAt: string;
  servers: Server[];
}

export interface ServerRconVerificationResult {
  verifiedAt: string;
}

export type WhitelistStatus = 'approved' | 'pending' | 'rejected';
export type WhitelistSource = 'application' | 'manual';

export interface WhitelistPlayer {
  id: string;
  nickname: string;
  steamId64: string;
  steamId: string;
  steamId3: string;
  contact?: string;
  note?: string;
  status: WhitelistStatus;
  source: WhitelistSource;
  appliedAt: string;
  reviewedAt?: string;
}

export interface WhitelistApplicationHistory {
  steamId64: string;
  steamId: string;
  steamId3: string;
  duplicateBlocked: boolean;
  blockReason?: string;
  historyHint?: string;
  records: WhitelistPlayer[];
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
  serverId?: string;
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
  minEntryRating: number;
  minSteamLevel: number;
}

export interface ServerSettingsDraft {
  ip: string;
  port: number;
  rconPassword: string;
  whitelistEnabled: boolean;
  entryVerificationEnabled: boolean;
  minEntryRating: number;
  minSteamLevel: number;
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

export interface PublicWhitelistApplicationDraft {
  nickname?: string;
  steamIdentifier: string;
  contact?: string;
  note?: string;
}

export interface ResolvedSteamProfile {
  nickname: string;
  steamId64: string;
  steamId: string;
  steamId3: string;
  profileUrl: string;
}

export interface WebsiteAdmin {
  id: string;
  username: string;
  displayName: string;
  role: WebsiteAdminRole;
  email?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  token: string;
  admin: WebsiteAdmin;
}

export interface WebsiteAdminCreateDraft {
  username: string;
  displayName: string;
  password: string;
  email?: string;
  note?: string;
  role: WebsiteAdminRole;
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
  | 'community_updated'
  | 'community_deleted'
  | 'server_created'
  | 'server_updated'
  | 'server_deleted'
  | 'server_plugin_token_reset'
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
  | 'admin_created'
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
