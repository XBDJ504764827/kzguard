import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { execute, mapBanRows, queryRows, withTransaction } from '../../db/mysql.js';
import type {
  BanRecord,
  BanRecordOperator,
  BanRecordUpdateDraft,
  BanServerPlayerDraft,
  ManualBanDraft,
} from '../../types/index.js';
import { HttpError } from '../../utils/errors.js';
import { resolveSteamIdentifiers } from '../../utils/steam.js';
import { validateBanDraft } from '../../utils/validation.js';
import { getOperatorSnapshot } from '../admins/service.js';
import { appendOperationLog } from '../operation-logs/service.js';

const toMySqlDateTime = (value: string) => value.slice(0, 23).replace('T', ' ');

const createBanRecord = (params: {
  nickname?: string;
  banType: BanRecord['banType'];
  steamIdentifier: string;
  ipAddress?: string;
  reason: string;
  durationSeconds?: number;
  serverName: string;
  communityName?: string;
  operator: BanRecordOperator;
  source: BanRecord['source'];
}): BanRecord => {
  const identifiers = resolveSteamIdentifiers(params.steamIdentifier);
  const now = new Date().toISOString();

  return {
    id: `ban_${randomUUID()}`,
    nickname: params.nickname?.trim() || undefined,
    banType: params.banType,
    status: 'active',
    steamIdentifier: params.steamIdentifier.trim(),
    steamId64: identifiers.steamId64,
    steamId: identifiers.steamId,
    steamId3: identifiers.steamId3,
    ipAddress: params.ipAddress?.trim() || undefined,
    reason: params.reason.trim(),
    durationSeconds: params.durationSeconds,
    bannedAt: now,
    serverName: params.serverName,
    communityName: params.communityName?.trim() || undefined,
    operatorId: params.operator.id,
    operatorName: params.operator.name,
    operatorRole: params.operator.role,
    source: params.source,
    updatedAt: now,
  };
};

const insertBanRecord = async (connection: PoolConnection, ban: BanRecord) => {
  await connection.execute(
    `INSERT INTO ban_records (
      id, nickname, ban_type, status, steam_identifier, steam_id64, steam_id, steam_id3, ip_address,
      reason, duration_seconds, banned_at, server_name, community_name, operator_id, operator_name,
      operator_role, source, updated_at, revoked_at, revoked_by_operator_id, revoked_by_operator_name, revoked_by_operator_role
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ban.id,
      ban.nickname ?? null,
      ban.banType,
      ban.status,
      ban.steamIdentifier,
      ban.steamId64,
      ban.steamId,
      ban.steamId3,
      ban.ipAddress ?? null,
      ban.reason,
      ban.durationSeconds ?? null,
      toMySqlDateTime(ban.bannedAt),
      ban.serverName,
      ban.communityName ?? null,
      ban.operatorId,
      ban.operatorName,
      ban.operatorRole,
      ban.source,
      ban.updatedAt ? toMySqlDateTime(ban.updatedAt) : null,
      null,
      null,
      null,
      null,
    ],
  );
};

export const listBans = async (): Promise<BanRecord[]> => {
  const rows = await queryRows<RowDataPacket[]>('SELECT * FROM ban_records ORDER BY banned_at DESC');
  return mapBanRows(rows);
};

export const banServerPlayer = async (
  communityId: string,
  serverId: string,
  playerId: string,
  draft: BanServerPlayerDraft,
  operatorId?: string,
): Promise<BanRecord> => {
  validateBanDraft(draft);
  const operator = await getOperatorSnapshot(operatorId);

  const ban = await withTransaction(async (connection) => {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT sp.*, s.name AS server_name, c.name AS community_name
        FROM server_players sp
        INNER JOIN servers s ON s.id = sp.server_id
        INNER JOIN communities c ON c.id = s.community_id
        WHERE sp.id = ? AND sp.server_id = ? AND c.id = ?`,
      [playerId, serverId, communityId],
    );
    const player = rows[0];

    if (!player) {
      throw new HttpError(404, '未找到要封禁的玩家或服务器');
    }

    const nextBan = createBanRecord({
      nickname: player.nickname as string,
      banType: draft.banType,
      steamIdentifier: player.steam_id as string,
      ipAddress: draft.ipAddress ?? (player.ip_address as string),
      reason: draft.reason,
      durationSeconds: draft.durationSeconds,
      serverName: player.server_name as string,
      communityName: player.community_name as string,
      operator,
      source: 'server_action',
    });

    await insertBanRecord(connection, nextBan);
    await connection.execute('DELETE FROM server_players WHERE id = ? AND server_id = ?', [playerId, serverId]);

    return nextBan;
  });

  await appendOperationLog(
    'server_player_banned',
    `在服务器 ${ban.serverName} 以${ban.banType === 'ip' ? 'IP封禁' : 'Steam账号封禁'}封禁了玩家 ${ban.nickname ?? ban.steamId}，IP：${ban.ipAddress ?? '等待玩家下次进服自动回填'}，时长为 ${ban.durationSeconds ? `${ban.durationSeconds} 秒` : '永久封禁'}。原因：${ban.reason}`,
    operator,
  );

  return ban;
};

export const createManualBanEntry = async (draft: ManualBanDraft, operatorId?: string): Promise<BanRecord> => {
  validateBanDraft(draft);
  const operator = await getOperatorSnapshot(operatorId);
  const ban = createBanRecord({
    nickname: draft.nickname,
    banType: draft.banType,
    steamIdentifier: draft.steamIdentifier,
    ipAddress: draft.ipAddress,
    reason: draft.reason,
    durationSeconds: draft.durationSeconds,
    serverName: '手动录入（未关联服务器）',
    operator,
    source: 'manual',
  });

  await execute(
    `INSERT INTO ban_records (
      id, nickname, ban_type, status, steam_identifier, steam_id64, steam_id, steam_id3, ip_address,
      reason, duration_seconds, banned_at, server_name, community_name, operator_id, operator_name,
      operator_role, source, updated_at, revoked_at, revoked_by_operator_id, revoked_by_operator_name, revoked_by_operator_role
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ban.id,
      ban.nickname ?? null,
      ban.banType,
      ban.status,
      ban.steamIdentifier,
      ban.steamId64,
      ban.steamId,
      ban.steamId3,
      ban.ipAddress ?? null,
      ban.reason,
      ban.durationSeconds ?? null,
      toMySqlDateTime(ban.bannedAt),
      ban.serverName,
      ban.communityName ?? null,
      ban.operatorId,
      ban.operatorName,
      ban.operatorRole,
      ban.source,
      toMySqlDateTime(ban.updatedAt!),
      null,
      null,
      null,
      null,
    ],
  );

  await appendOperationLog(
    'ban_record_manual_created',
    `手动添加了${ban.banType === 'ip' ? 'IP封禁' : 'Steam账号封禁'}记录：玩家 ${ban.nickname ?? '待后端匹配'}，Steam 标识 ${ban.steamIdentifier}，IP：${ban.ipAddress ?? '等待玩家下次进服自动回填'}，时长为 ${ban.durationSeconds ? `${ban.durationSeconds} 秒` : '永久封禁'}。原因：${ban.reason}`,
    operator,
  );

  return ban;
};

export const updateBanRecord = async (
  banId: string,
  draft: BanRecordUpdateDraft,
  operatorId?: string,
): Promise<BanRecord> => {
  validateBanDraft(draft);
  const operator = await getOperatorSnapshot(operatorId);
  const existingRows = await queryRows<RowDataPacket[]>('SELECT * FROM ban_records WHERE id = ?', [banId]);
  const existingBan = mapBanRows(existingRows)[0];

  if (!existingBan) {
    throw new HttpError(404, '未找到要编辑的封禁记录');
  }

  const identifiers = resolveSteamIdentifiers(draft.steamIdentifier);
  const updatedAt = new Date().toISOString();
  const updatedBan: BanRecord = {
    ...existingBan,
    nickname: draft.nickname?.trim() || undefined,
    banType: draft.banType,
    steamIdentifier: draft.steamIdentifier.trim(),
    steamId64: identifiers.steamId64,
    steamId: identifiers.steamId,
    steamId3: identifiers.steamId3,
    ipAddress: draft.ipAddress?.trim() || undefined,
    reason: draft.reason.trim(),
    durationSeconds: draft.durationSeconds,
    serverName: draft.serverName?.trim() || existingBan.serverName,
    communityName: draft.communityName?.trim() || undefined,
    updatedAt,
  };

  await execute(
    `UPDATE ban_records
      SET nickname = ?, ban_type = ?, steam_identifier = ?, steam_id64 = ?, steam_id = ?, steam_id3 = ?,
          ip_address = ?, reason = ?, duration_seconds = ?, server_name = ?, community_name = ?, updated_at = ?
      WHERE id = ?`,
    [
      updatedBan.nickname ?? null,
      updatedBan.banType,
      updatedBan.steamIdentifier,
      updatedBan.steamId64,
      updatedBan.steamId,
      updatedBan.steamId3,
      updatedBan.ipAddress ?? null,
      updatedBan.reason,
      updatedBan.durationSeconds ?? null,
      updatedBan.serverName,
      updatedBan.communityName ?? null,
      toMySqlDateTime(updatedAt),
      banId,
    ],
  );

  await appendOperationLog(
    'ban_record_updated',
    `编辑了封禁记录 ${existingBan.nickname ?? existingBan.steamId}，更新为${updatedBan.banType === 'ip' ? 'IP封禁' : 'Steam账号封禁'}，时长为 ${updatedBan.durationSeconds ? `${updatedBan.durationSeconds} 秒` : '永久封禁'}，原因：${updatedBan.reason}`,
    operator,
  );

  return updatedBan;
};

export const revokeBanRecord = async (banId: string, operatorId?: string): Promise<BanRecord> => {
  const operator = await getOperatorSnapshot(operatorId);
  const existingRows = await queryRows<RowDataPacket[]>('SELECT * FROM ban_records WHERE id = ?', [banId]);
  const existingBan = mapBanRows(existingRows)[0];

  if (!existingBan) {
    throw new HttpError(404, '未找到要解除的封禁记录');
  }

  if (existingBan.status === 'revoked') {
    throw new HttpError(400, '该封禁记录已解除');
  }

  const now = new Date().toISOString();

  await execute(
    `UPDATE ban_records
      SET status = 'revoked', updated_at = ?, revoked_at = ?, revoked_by_operator_id = ?, revoked_by_operator_name = ?, revoked_by_operator_role = ?
      WHERE id = ?`,
    [toMySqlDateTime(now), toMySqlDateTime(now), operator.id, operator.name, operator.role, banId],
  );

  const revokedBan: BanRecord = {
    ...existingBan,
    status: 'revoked',
    updatedAt: now,
    revokedAt: now,
    revokedByOperatorId: operator.id,
    revokedByOperatorName: operator.name,
    revokedByOperatorRole: operator.role,
  };

  await appendOperationLog(
    'ban_record_revoked',
    `解除了玩家 ${revokedBan.nickname ?? revokedBan.steamId} 的封禁，原封禁属性为${revokedBan.banType === 'ip' ? 'IP封禁' : 'Steam账号封禁'}。`,
    operator,
  );

  return revokedBan;
};

export const deleteBanRecord = async (banId: string, operatorId?: string): Promise<void> => {
  const operator = await getOperatorSnapshot(operatorId);
  const existingRows = await queryRows<RowDataPacket[]>('SELECT * FROM ban_records WHERE id = ?', [banId]);
  const existingBan = mapBanRows(existingRows)[0];

  if (!existingBan) {
    throw new HttpError(404, '未找到要删除的封禁记录');
  }

  await execute('DELETE FROM ban_records WHERE id = ?', [banId]);

  await appendOperationLog(
    'ban_record_deleted',
    `删除了封禁记录 ${existingBan.nickname ?? existingBan.steamId}（${existingBan.banType === 'ip' ? 'IP封禁' : 'Steam账号封禁'}）。`,
    operator,
  );
};
