import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { execute, mapWhitelistRows, queryRows } from '../../db/mysql.js';
import type {
  ApplicationDraft,
  ManualWhitelistDraft,
  WhitelistPlayerRecord,
  WhitelistStatus,
} from '../../types/index.js';
import { HttpError } from '../../utils/errors.js';
import { validateApplicationDraft, validateManualWhitelistDraft } from '../../utils/validation.js';
import { getOperatorSnapshot } from '../admins/service.js';
import { appendOperationLog } from '../operation-logs/service.js';

const toMySqlDateTime = (value: string) => value.slice(0, 23).replace('T', ' ');

export const listWhitelist = async (status?: WhitelistStatus) => {
  const params: unknown[] = [];
  let sql = 'SELECT * FROM whitelist_players';

  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }

  sql += ' ORDER BY applied_at DESC';

  const rows = await queryRows<RowDataPacket[]>(sql, params);
  return mapWhitelistRows(rows);
};

export const createApplication = async (draft: ApplicationDraft): Promise<WhitelistPlayerRecord> => {
  validateApplicationDraft(draft);

  const player: WhitelistPlayerRecord = {
    id: `player_${randomUUID()}`,
    nickname: draft.nickname.trim(),
    steamId: draft.steamId.trim(),
    contact: draft.contact?.trim() || undefined,
    note: draft.note?.trim() || undefined,
    status: 'pending',
    source: 'application',
    appliedAt: new Date().toISOString(),
  };

  await execute(
    `INSERT INTO whitelist_players (
      id, nickname, steam_id, contact, note, status, source, applied_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      player.id,
      player.nickname,
      player.steamId,
      player.contact ?? null,
      player.note ?? null,
      player.status,
      player.source,
      toMySqlDateTime(player.appliedAt),
      null,
    ],
  );

  return player;
};

export const createManualWhitelistEntry = async (
  draft: ManualWhitelistDraft,
  operatorId?: string,
): Promise<WhitelistPlayerRecord> => {
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
    reviewedAt: now,
  };

  await execute(
    `INSERT INTO whitelist_players (
      id, nickname, steam_id, contact, note, status, source, applied_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      player.id,
      player.nickname,
      player.steamId,
      player.contact ?? null,
      player.note ?? null,
      player.status,
      player.source,
      toMySqlDateTime(player.appliedAt),
      toMySqlDateTime(player.reviewedAt ?? now),
    ],
  );

  await appendOperationLog(
    'whitelist_manual_added',
    `手动录入玩家 ${player.nickname} 到白名单，结果为 ${player.status === 'approved' ? '已通过' : '已拒绝'}。`,
    await getOperatorSnapshot(operatorId),
  );

  return player;
};

export const reviewPlayer = async (
  playerId: string,
  status: Extract<WhitelistStatus, 'approved' | 'rejected'>,
  note?: string,
  operatorId?: string,
) => {
  const existingRows = await queryRows<RowDataPacket[]>('SELECT * FROM whitelist_players WHERE id = ?', [playerId]);
  const existingPlayer = mapWhitelistRows(existingRows)[0];

  if (!existingPlayer) {
    throw new HttpError(404, '未找到目标玩家');
  }

  const reviewedAt = new Date().toISOString();
  const nextNote = note?.trim() || existingPlayer.note;

  await execute(
    'UPDATE whitelist_players SET status = ?, note = ?, reviewed_at = ? WHERE id = ?',
    [status, nextNote ?? null, toMySqlDateTime(reviewedAt), playerId],
  );

  await appendOperationLog(
    status === 'approved' ? 'whitelist_approved' : 'whitelist_rejected',
    `${status === 'approved' ? '审核通过' : '审核拒绝'}玩家 ${existingPlayer.nickname} 的白名单申请。${note?.trim() ? ` 备注：${note.trim()}` : ''}`,
    await getOperatorSnapshot(operatorId),
  );
};
