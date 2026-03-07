import type {
  BanRecord,
  PublicBanStatusFilter,
  PublicWhitelistApplicationDraft,
  PublicWhitelistStatusFilter,
  ResolvedSteamProfile,
  WhitelistApplicationHistory,
  WhitelistPlayer,
} from '../types';
import type { ApiEnvelope } from './contracts';
import { requestJson } from './request';

const unwrap = <T,>(payload: ApiEnvelope<T>) => payload.data;

const buildQueryString = (params: Record<string, string | undefined>) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim()) {
      searchParams.set(key, value.trim());
    }
  });

  const encoded = searchParams.toString();
  return encoded ? `?${encoded}` : '';
};

export const publicApi = {
  async resolveSteamProfile(identifier: string) {
    const payload = await requestJson<ApiEnvelope<ResolvedSteamProfile>>(
      `/public/steam/resolve${buildQueryString({ identifier })}`,
    );

    return unwrap(payload);
  },
  async getWhitelistHistory(identifier: string) {
    const payload = await requestJson<ApiEnvelope<WhitelistApplicationHistory>>(
      `/public/whitelist/history${buildQueryString({ identifier })}`,
    );

    return unwrap(payload);
  },
  async createWhitelistApplication(draft: PublicWhitelistApplicationDraft) {
    const payload = await requestJson<ApiEnvelope<WhitelistPlayer>>('/public/whitelist/applications', {
      method: 'POST',
      body: JSON.stringify(draft),
    });

    return unwrap(payload);
  },
  async listWhitelist(params: { status?: PublicWhitelistStatusFilter; search?: string }) {
    const payload = await requestJson<ApiEnvelope<WhitelistPlayer[]>>(
      `/public/whitelist${buildQueryString({
        status: params.status && params.status !== 'all' ? params.status : undefined,
        search: params.search,
      })}`,
    );

    return unwrap(payload);
  },
  async listBans(params: { status?: PublicBanStatusFilter; search?: string }) {
    const payload = await requestJson<ApiEnvelope<BanRecord[]>>(
      `/public/bans${buildQueryString({
        status: params.status && params.status !== 'all' ? params.status : undefined,
        search: params.search,
      })}`,
    );

    return unwrap(payload);
  },
};
