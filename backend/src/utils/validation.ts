import { HttpError } from './errors.js';
import type { ApplicationDraft, ManualWhitelistDraft, ServerDraft } from '../types/index.js';

const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export const requireNonEmpty = (value: string, message: string) => {
  if (!value.trim()) {
    throw new HttpError(400, message);
  }
};

export const validateServerDraft = (draft: ServerDraft) => {
  requireNonEmpty(draft.name, '请输入服务器名称');

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
