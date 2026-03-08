import type {
  AppState,
  AuthSession,
  BanRecord,
  BanRecordOperator,
  BanRecordUpdateDraft,
  BanServerPlayerDraft,
  LoginDraft,
  ManualBanDraft,
  ManualWhitelistDraft,
  WhitelistPlayerUpdateDraft,
  WhitelistRestriction,
  OperationLog,
  ServerDraft,
  ServerPlayersSnapshot,
  ServerRconVerificationResult,
  ServerSettingsDraft,
  UserSummary,
  WebsiteAdmin,
  WebsiteAdminCreateDraft,
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
    const [communitiesPayload, whitelistPayload, whitelistRestrictionsPayload, bansPayload] = await Promise.all([
      requestJson<ApiEnvelope<AppState['communities']>>('/communities'),
      requestJson<ApiEnvelope<AppState['whitelist']>>('/whitelist'),
      requestJson<ApiEnvelope<AppState['whitelistRestrictions']>>('/whitelist/restrictions'),
      requestJson<ApiEnvelope<AppState['bans']>>('/bans'),
    ]);

    return {
      communities: unwrap(communitiesPayload),
      whitelist: unwrap(whitelistPayload),
      whitelistRestrictions: unwrap(whitelistRestrictionsPayload),
      bans: unwrap(bansPayload),
    };
  },
  async listWebsiteAdmins() {
    const payload = await requestJson<ApiEnvelope<WebsiteAdmin[]>>('/admins');
    return unwrap(payload);
  },
  async createWebsiteAdmin(draft: WebsiteAdminCreateDraft) {
    const payload = await requestJson<ApiEnvelope<WebsiteAdmin>>('/admins', {
      method: 'POST',
      body: JSON.stringify(draft),
    });

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
  async updateCommunity(communityId, name) {
    const payload = await requestJson<ApiEnvelope<AppState['communities'][number]>>(`/communities/${communityId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });

    return unwrap(payload);
  },
  async deleteCommunity(communityId) {
    await requestJson<{ message: string }>(`/communities/${communityId}`, {
      method: 'DELETE',
    });
  },
  async verifyServerRcon(communityId, draft): Promise<ServerRconVerificationResult> {
    const payload = await requestJson<ApiEnvelope<ServerRconVerificationResult>>(`/communities/${communityId}/servers/verify-rcon`, {
      method: 'POST',
      body: JSON.stringify(draft),
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
  async resetServerPluginToken(communityId, serverId) {
    const payload = await requestJson<ApiEnvelope<AppState['communities'][number]['servers'][number]>>(
      `/communities/${communityId}/servers/${serverId}/plugin-token/reset`,
      {
        method: 'POST',
      },
    );

    return unwrap(payload);
  },
  async restartServer(communityId, serverId) {
    await requestJson<{ message: string }>(`/communities/${communityId}/servers/${serverId}/restart`, {
      method: 'POST',
    });
  },
  async deleteServer(communityId, serverId) {
    await requestJson<{ message: string }>(`/communities/${communityId}/servers/${serverId}`, {
      method: 'DELETE',
    });
  },
  async listServerPlayers(communityId: string, serverId: string): Promise<ServerPlayersSnapshot> {
    const payload = await requestJson<ApiEnvelope<ServerPlayersSnapshot>>(
      `/communities/${communityId}/servers/${serverId}/players`,
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
  async createManualWhitelistEntry(draft: ManualWhitelistDraft) {
    const payload = await requestJson<ApiEnvelope<AppState['whitelist'][number]>>('/whitelist/manual', {
      method: 'POST',
      body: JSON.stringify(draft),
    });

    return unwrap(payload);
  },
  async updateWhitelistPlayer(playerId, draft: WhitelistPlayerUpdateDraft) {
    const payload = await requestJson<ApiEnvelope<AppState['whitelist'][number]>>(`/whitelist/${playerId}`, {
      method: 'PATCH',
      body: JSON.stringify(draft),
    });

    return unwrap(payload);
  },
  async deleteWhitelistPlayer(playerId) {
    await requestJson<{ message: string }>(`/whitelist/${playerId}`, {
      method: 'DELETE',
    });
  },
  async listWhitelistRestrictions(): Promise<WhitelistRestriction[]> {
    const payload = await requestJson<ApiEnvelope<WhitelistRestriction[]>>('/whitelist/restrictions');
    return unwrap(payload);
  },
  async addWhitelistRestriction(playerId: string): Promise<WhitelistRestriction> {
    const payload = await requestJson<ApiEnvelope<WhitelistRestriction>>(`/whitelist/${playerId}/restriction`, {
      method: 'POST',
    });
    return unwrap(payload);
  },
  async updateWhitelistRestriction(playerId: string, serverIds: string[]): Promise<WhitelistRestriction> {
    const payload = await requestJson<ApiEnvelope<WhitelistRestriction>>(`/whitelist/${playerId}/restriction`, {
      method: 'PATCH',
      body: JSON.stringify({ serverIds }),
    });
    return unwrap(payload);
  },
  async deleteWhitelistRestriction(playerId: string) {
    await requestJson<{ message: string }>(`/whitelist/${playerId}/restriction`, {
      method: 'DELETE',
    });
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
