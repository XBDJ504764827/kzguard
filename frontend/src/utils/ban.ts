import type { BanSource, BanStatus, BanType } from '../types';

export const banTypeLabelMap: Record<BanType, string> = {
  steam_account: 'Steam账号封禁',
  ip: 'IP封禁',
};

export const banSourceLabelMap: Record<BanSource, string> = {
  manual: '管理员手动添加',
  server_action: '服务器内封禁',
};

export const banStatusLabelMap: Record<BanStatus, string> = {
  active: '生效中',
  revoked: '已解除',
};

export const banStatusColorMap: Record<BanStatus, 'red' | 'gray'> = {
  active: 'red',
  revoked: 'gray',
};

export const getBanDurationLabel = (durationSeconds?: number) =>
  durationSeconds ? `${durationSeconds} 秒` : '永久封禁';

export const getBanTypeDescription = (banType: BanType) => {
  if (banType === 'ip') {
    return 'IP 封禁会限制该玩家当前 IP 下的所有账号进入服务器，除非更换其他 IP。';
  }

  return 'Steam 账号封禁仅限制当前 Steam 账号进入服务器，更换其他账号后仍可尝试进入。';
};

export const getBanExpiresAt = (bannedAt: string, durationSeconds?: number) => {
  if (!durationSeconds) {
    return undefined;
  }

  return new Date(new Date(bannedAt).getTime() + durationSeconds * 1000).toISOString();
};
