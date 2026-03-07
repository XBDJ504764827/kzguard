import type {
  AppState,
  ApplicationDraft,
  AuthSession,
  BanRecord,
  BanRecordOperator,
  BanRecordUpdateDraft,
  BanServerPlayerDraft,
  LoginDraft,
  ManualBanDraft,
  ManualWhitelistDraft,
  OperationLog,
  ServerDraft,
  ServerSettingsDraft,
  UserSummary,
  WebsiteAdmin,
  WebsiteAdminUpdateDraft,
} from '../../types';
import type { ApiEnvelope, KzGuardApi } from '../contracts';
import { requestJson } from '../request';

const unwrap = <T,>(payload: ApiEnvelope<T>) => payload.data;

export const httpApi: KzGuardApi = {
  mode: 'http',
  async login(draft: LoginDraft) {
    const payload = await requestJson<ApiEnvelope<AuthSession>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(draft),
    });

    return unwrap(payload);
  },
  async getAuthSession() {
    const payload = await requestJson<ApiEnvelope<WebsiteAdmin>>('/auth/session');
    return unwrap(payload);
  },
  async logout() {
    await requestJson<{ message: string }>('/auth/logout', {
      method: 'POST',
    });
  },
  async loadState() {
    const [communitiesPayload, whitelistPayload, bansPayload] = await Promise.all([
      requestJson<ApiEnvelope<AppState['communities']>>('/communities'),
      requestJson<ApiEnvelope<AppState['whitelist']>>('/whitelist'),
      requestJson<ApiEnvelope<AppState['bans']>>('/bans'),
    ]);

    return {
      communities: unwrap(communitiesPayload),
      whitelist: unwrap(whitelistPayload),
      bans: unwrap(bansPayload),
    };
  },
  async listWebsiteAdmins() {
    const payload = await requestJson<ApiEnvelope<WebsiteAdmin[]>>('/admins');
    return unwrap(payload);
  },
  async updateWebsiteAdmin(adminId: string, draft: WebsiteAdminUpdateDraft) {
    const payload = await requestJson<ApiEnvelope<WebsiteAdmin>>(`/admins/${adminId}`, {
      method: 'PATCH',
      body: JSON.stringify(draft),
    });

    return unwrap(payload);
  },
  async listOperationLogs() {
    const payload = await requestJson<ApiEnvelope<OperationLog[]>>('/operation-logs');
    return unwrap(payload);
  },
  async createCommunity(name) {
    const payload = await requestJson<ApiEnvelope<AppState['communities'][number]>>('/communities', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

    return unwrap(payload);
  },
  async createServer(communityId, draft) {
    const payload = await requestJson<ApiEnvelope<AppState['communities'][number]['servers'][number]>>(
      `/communities/${communityId}/servers`,
      {
        method: 'POST',
        body: JSON.stringify(draft),
      },
    );

    return unwrap(payload);
  },
  async updateServer(communityId, serverId, draft: ServerSettingsDraft) {
    const payload = await requestJson<ApiEnvelope<AppState['communities'][number]['servers'][number]>>(
      `/communities/${communityId}/servers/${serverId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(draft),
      },
    );

    return unwrap(payload);
  },
  async kickServerPlayer(communityId, serverId, playerId, reason) {
    await requestJson<{ message: string }>(`/communities/${communityId}/servers/${serverId}/players/${playerId}/kick`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  async banServerPlayer(communityId, serverId, playerId, draft: BanServerPlayerDraft, operator: BanRecordOperator) {
    const payload = await requestJson<ApiEnvelope<BanRecord>>(
      `/communities/${communityId}/servers/${serverId}/players/${playerId}/ban`,
      {
        method: 'POST',
        body: JSON.stringify({ ...draft, operator }),
      },
    );

    return unwrap(payload);
  },
  async createManualBanEntry(draft: ManualBanDraft, operator: BanRecordOperator) {
    const payload = await requestJson<ApiEnvelope<BanRecord>>('/bans/manual', {
      method: 'POST',
      body: JSON.stringify({ ...draft, operator }),
    });

    return unwrap(payload);
  },
  async updateBanRecord(banId, draft: BanRecordUpdateDraft, operator: BanRecordOperator) {
    const payload = await requestJson<ApiEnvelope<BanRecord>>(`/bans/${banId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...draft, operator }),
    });

    return unwrap(payload);
  },
  async revokeBanRecord(banId, operator: BanRecordOperator) {
    const payload = await requestJson<ApiEnvelope<BanRecord>>(`/bans/${banId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ operator }),
    });

    return unwrap(payload);
  },
  async deleteBanRecord(banId, operator: BanRecordOperator) {
    await requestJson<{ message: string }>(`/bans/${banId}`, {
      method: 'DELETE',
      body: JSON.stringify({ operator }),
    });
  },
  async createApplication(draft: ApplicationDraft) {
    const payload = await requestJson<ApiEnvelope<AppState['whitelist'][number]>>('/whitelist/applications', {
      method: 'POST',
      body: JSON.stringify(draft),
    });

    return unwrap(payload);
  },
  async createManualWhitelistEntry(draft: ManualWhitelistDraft) {
    const payload = await requestJson<ApiEnvelope<AppState['whitelist'][number]>>('/whitelist/manual', {
      method: 'POST',
      body: JSON.stringify(draft),
    });

    return unwrap(payload);
  },
  async updateWhitelistStatus(playerId, status, note) {
    await requestJson<{ message: string }>(`/whitelist/${playerId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
  },
  async getUsersSummary() {
    return requestJson<UserSummary>('/users/summary');
  },
};
