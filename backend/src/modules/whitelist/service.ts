import { randomUUID } from 'node:crypto';
import { appStore } from '../../store/appStore.js';
import { HttpError } from '../../utils/errors.js';
import { validateApplicationDraft, validateManualWhitelistDraft } from '../../utils/validation.js';
import type {
  ApplicationDraft,
  ManualWhitelistDraft,
  WhitelistPlayerRecord,
  WhitelistStatus
} from '../../types/index.js';

export const listWhitelist = (status?: WhitelistStatus) => {
  const whitelist = appStore.getState().whitelist;

  if (!status) {
    return whitelist;
  }

  return whitelist.filter((player) => player.status === status);
};

export const createApplication = (draft: ApplicationDraft): WhitelistPlayerRecord => {
  validateApplicationDraft(draft);

  const player: WhitelistPlayerRecord = {
    id: `player_${randomUUID()}`,
    nickname: draft.nickname.trim(),
    steamId: draft.steamId.trim(),
    contact: draft.contact?.trim() || undefined,
    note: draft.note?.trim() || undefined,
    status: 'pending',
    source: 'application',
    appliedAt: new Date().toISOString()
  };

  appStore.update((currentState) => ({
    ...currentState,
    whitelist: [player, ...currentState.whitelist]
  }));

  return player;
};

export const createManualWhitelistEntry = (draft: ManualWhitelistDraft): WhitelistPlayerRecord => {
  validateManualWhitelistDraft(draft);

  const now = new Date().toISOString();
  const player: WhitelistPlayerRecord = {
    id: `player_${randomUUID()}`,
    nickname: draft.nickname.trim(),
    steamId: draft.steamId.trim(),
    contact: draft.contact?.trim() || undefined,
    note: draft.note?.trim() || undefined,
    status: draft.status,
    source: 'manual',
    appliedAt: now,
    reviewedAt: now
  };

  appStore.update((currentState) => ({
    ...currentState,
    whitelist: [player, ...currentState.whitelist]
  }));

  return player;
};

export const reviewPlayer = (playerId: string, status: Extract<WhitelistStatus, 'approved' | 'rejected'>, note?: string) => {
  const currentState = appStore.getState();
  const existingPlayer = currentState.whitelist.find((player) => player.id === playerId);

  if (!existingPlayer) {
    throw new HttpError(404, '未找到目标玩家');
  }

  appStore.update((state) => ({
    ...state,
    whitelist: state.whitelist.map((player) => {
      if (player.id !== playerId) {
        return player;
      }

      return {
        ...player,
        status,
        note: note?.trim() || player.note,
        reviewedAt: new Date().toISOString()
      };
    })
  }));
};
