export type ThemeMode = 'light' | 'dark';
export type ApiMode = 'mock' | 'http';

export interface Server {
  id: string;
  name: string;
  ip: string;
  port: number;
  rconPassword: string;
  rconVerifiedAt: string;
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

export interface AppState {
  communities: Community[];
  whitelist: WhitelistPlayer[];
}

export interface ServerDraft {
  name: string;
  ip: string;
  port: number;
  rconPassword: string;
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

export type WebsiteAdminRole = 'system_admin' | 'normal_admin';

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
