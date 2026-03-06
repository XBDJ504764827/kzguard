import type { AppState, ApplicationDraft, ManualWhitelistDraft, ServerDraft, UserSummary } from '../../types';
import type { ApiEnvelope, KzGuardApi } from '../contracts';
import { requestJson } from '../request';

const unwrap = <T,>(payload: ApiEnvelope<T>) => payload.data;

export const httpApi: KzGuardApi = {
  mode: 'http',
  async loadState() {
    const [communitiesPayload, whitelistPayload] = await Promise.all([
      requestJson<ApiEnvelope<AppState['communities']>>('/communities'),
      requestJson<ApiEnvelope<AppState['whitelist']>>('/whitelist'),
    ]);

    return {
      communities: unwrap(communitiesPayload),
      whitelist: unwrap(whitelistPayload),
    };
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
