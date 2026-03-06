export type WhitelistStatus = 'approved' | 'pending' | 'rejected';
export type WhitelistSource = 'application' | 'manual';

export interface ServerRecord {
  id: string;
  name: string;
  ip: string;
  port: number;
  rconPassword: string;
  rconVerifiedAt: string;
}

export interface CommunityRecord {
  id: string;
  name: string;
  createdAt: string;
  servers: ServerRecord[];
}

export interface WhitelistPlayerRecord {
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
  communities: CommunityRecord[];
  whitelist: WhitelistPlayerRecord[];
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
