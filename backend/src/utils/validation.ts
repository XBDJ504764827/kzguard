import { HttpError } from './errors.js';
import type {
  ApplicationDraft,
  BanRecordUpdateDraft,
  BanServerPlayerDraft,
  ManualBanDraft,
  ManualWhitelistDraft,
  ServerDraft,
  ServerSettingsDraft,
  WebsiteAdminUpdateDraft,
} from '../types/index.js';

const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export const requireNonEmpty = (value: string, message: string) => {
  if (!value.trim()) {
    throw new HttpError(400, message);
  }
};

const validateIpIfProvided = (value?: string, message = '玩家 IP 格式不正确') => {
  if (!value?.trim()) {
    return;
  }

  if (!ipv4Pattern.test(value.trim())) {
    throw new HttpError(400, message);
  }
};

export const validateServerDraft = (draft: ServerDraft | ServerSettingsDraft, options?: { skipName?: boolean }) => {
  if (!options?.skipName && 'name' in draft) {
    requireNonEmpty(draft.name, '请输入服务器名称');
  }

  if (!ipv4Pattern.test(draft.ip.trim())) {
    throw new HttpError(400, '请输入有效的 IPv4 地址');
  }

  if (!Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535) {
    throw new HttpError(400, '端口范围需在 1 到 65535 之间');
  }

  if (draft.rconPassword.trim().length < 6) {
    throw new HttpError(400, 'RCON 密码至少需要 6 位');
  }
};

export const validateApplicationDraft = (draft: ApplicationDraft) => {
  requireNonEmpty(draft.nickname, '请输入玩家昵称');
  requireNonEmpty(draft.steamId, '请输入 Steam ID');
};

export const validateManualWhitelistDraft = (draft: ManualWhitelistDraft) => {
  validateApplicationDraft(draft);

  if (draft.status !== 'approved' && draft.status !== 'rejected') {
    throw new HttpError(400, '管理员手动添加状态仅支持 approved 或 rejected');
  }
};

const validateBanDuration = (durationSeconds?: number) => {
  if (durationSeconds === undefined) {
    return;
  }

  if (!Number.isInteger(durationSeconds) || durationSeconds < 1) {
    throw new HttpError(400, '封禁秒数必须大于 0');
  }
};

export const validateBanDraft = (draft: ManualBanDraft | BanRecordUpdateDraft | BanServerPlayerDraft) => {
  if ('steamIdentifier' in draft) {
    requireNonEmpty(draft.steamIdentifier, '请输入玩家 Steam 标识');
  }

  if ('banType' in draft && draft.banType !== 'steam_account' && draft.banType !== 'ip') {
    throw new HttpError(400, '封禁属性仅支持 steam_account 或 ip');
  }

  validateIpIfProvided(draft.ipAddress);
  validateBanDuration(draft.durationSeconds);
  requireNonEmpty(draft.reason, '请输入封禁原因');
};

export const validateWebsiteAdminUpdateDraft = (draft: WebsiteAdminUpdateDraft) => {
  requireNonEmpty(draft.username, '请输入用户名');
  requireNonEmpty(draft.displayName, '请输入管理员名称');

  if (draft.password.trim() && draft.password.trim().length < 6) {
    throw new HttpError(400, '密码至少需要 6 位');
  }

  if (draft.role !== 'system_admin' && draft.role !== 'normal_admin') {
    throw new HttpError(400, '管理员角色不合法');
  }
};
