import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { execute, mapCommunityRows, queryRows } from '../../db/mysql.js';
import type { CommunityRecord, ServerDraft, ServerRecord, ServerSettingsDraft } from '../../types/index.js';
import { HttpError } from '../../utils/errors.js';
import { verifyRconConnection } from '../../utils/rcon.js';
import { requireNonEmpty, validateServerDraft } from '../../utils/validation.js';
import { getOperatorSnapshot } from '../admins/service.js';
import { appendOperationLog } from '../operation-logs/service.js';

export const listCommunities = async (): Promise<CommunityRecord[]> => {
  const [communityRows, serverRows, playerRows] = await Promise.all([
    queryRows<RowDataPacket[]>('SELECT * FROM communities ORDER BY created_at DESC'),
    queryRows<RowDataPacket[]>('SELECT * FROM servers ORDER BY rcon_verified_at DESC'),
    queryRows<RowDataPacket[]>('SELECT * FROM server_players ORDER BY connected_at DESC'),
  ]);

  return mapCommunityRows(communityRows, serverRows, playerRows);
};

export const createCommunity = async (name: string, operatorId?: string): Promise<CommunityRecord> => {
  requireNonEmpty(name, '请输入社区名称');

  const community: CommunityRecord = {
    id: `community_${randomUUID()}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
    servers: [],
  };

  await execute('INSERT INTO communities (id, name, created_at) VALUES (?, ?, ?)', [
    community.id,
    community.name,
    community.createdAt.slice(0, 23).replace('T', ' '),
  ]);

  await appendOperationLog('community_created', `新增社区 “${community.name}”。`, await getOperatorSnapshot(operatorId));

  return community;
};

export const createServer = async (
  communityId: string,
  draft: ServerDraft,
  operatorId?: string,
): Promise<ServerRecord> => {
  validateServerDraft(draft);

  const communityRows = await queryRows<RowDataPacket[]>('SELECT * FROM communities WHERE id = ?', [communityId]);
  const community = communityRows[0];

  if (!community) {
    throw new HttpError(404, '未找到目标社区');
  }

  const verified = await verifyRconConnection(draft);

  if (!verified) {
    throw new HttpError(400, 'RCON 校验失败，请检查服务器信息');
  }

  const server: ServerRecord = {
    id: `server_${randomUUID()}`,
    name: draft.name.trim(),
    ip: draft.ip.trim(),
    port: draft.port,
    rconPassword: draft.rconPassword,
    rconVerifiedAt: new Date().toISOString(),
    whitelistEnabled: draft.whitelistEnabled,
    entryVerificationEnabled: draft.entryVerificationEnabled,
    onlinePlayers: [],
  };

  await execute(
    `INSERT INTO servers (
      id, community_id, name, ip, port, rcon_password, rcon_verified_at, whitelist_enabled, entry_verification_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      server.id,
      communityId,
      server.name,
      server.ip,
      server.port,
      server.rconPassword,
      server.rconVerifiedAt.slice(0, 23).replace('T', ' '),
      server.whitelistEnabled ? 1 : 0,
      server.entryVerificationEnabled ? 1 : 0,
    ],
  );

  await appendOperationLog(
    'server_created',
    `向社区 “${community.name as string}” 添加服务器 ${server.name}（${server.ip}:${server.port}），并完成 RCON 校验。`,
    await getOperatorSnapshot(operatorId),
  );

  return server;
};

export const updateServerSettings = async (
  communityId: string,
  serverId: string,
  draft: ServerSettingsDraft,
  operatorId?: string,
): Promise<ServerRecord> => {
  validateServerDraft(draft, { skipName: true });

  const serverRows = await queryRows<RowDataPacket[]>(
    'SELECT s.*, c.name AS community_name FROM servers s INNER JOIN communities c ON c.id = s.community_id WHERE s.id = ? AND s.community_id = ?',
    [serverId, communityId],
  );
  const existingServer = serverRows[0];

  if (!existingServer) {
    throw new HttpError(404, '未找到目标服务器');
  }

  const nextVerifiedAt = new Date().toISOString();

  await execute(
    `UPDATE servers
      SET ip = ?, port = ?, rcon_password = ?, rcon_verified_at = ?, whitelist_enabled = ?, entry_verification_enabled = ?
      WHERE id = ? AND community_id = ?`,
    [
      draft.ip.trim(),
      draft.port,
      draft.rconPassword,
      nextVerifiedAt.slice(0, 23).replace('T', ' '),
      draft.whitelistEnabled ? 1 : 0,
      draft.entryVerificationEnabled ? 1 : 0,
      serverId,
      communityId,
    ],
  );

  const playerRows = await queryRows<RowDataPacket[]>('SELECT * FROM server_players WHERE server_id = ? ORDER BY connected_at DESC', [serverId]);

  const server: ServerRecord = {
    id: serverId,
    name: existingServer.name as string,
    ip: draft.ip.trim(),
    port: draft.port,
    rconPassword: draft.rconPassword,
    rconVerifiedAt: nextVerifiedAt,
    whitelistEnabled: draft.whitelistEnabled,
    entryVerificationEnabled: draft.entryVerificationEnabled,
    onlinePlayers: playerRows.map((row) => ({
      id: row.id as string,
      nickname: row.nickname as string,
      steamId: row.steam_id as string,
      ipAddress: row.ip_address as string,
      connectedAt: new Date(row.connected_at as Date).toISOString(),
      ping: Number(row.ping),
    })),
  };

  await appendOperationLog(
    'server_updated',
    `更新了服务器 ${server.name} 的连接参数为 ${server.ip}:${server.port}，白名单${server.whitelistEnabled ? '开启' : '关闭'}，进服验证${server.entryVerificationEnabled ? '开启' : '关闭'}。`,
    await getOperatorSnapshot(operatorId),
  );

  return server;
};

export const kickServerPlayer = async (
  communityId: string,
  serverId: string,
  playerId: string,
  reason: string,
  operatorId?: string,
): Promise<void> => {
  requireNonEmpty(reason, '请输入踢出理由');

  const rows = await queryRows<RowDataPacket[]>(
    `SELECT sp.nickname, s.name AS server_name
      FROM server_players sp
      INNER JOIN servers s ON s.id = sp.server_id
      WHERE sp.id = ? AND sp.server_id = ? AND s.community_id = ?`,
    [playerId, serverId, communityId],
  );
  const player = rows[0];

  if (!player) {
    throw new HttpError(404, '未找到目标玩家');
  }

  await execute('DELETE FROM server_players WHERE id = ? AND server_id = ?', [playerId, serverId]);

  await appendOperationLog(
    'server_player_kicked',
    `从服务器 ${player.server_name as string} 踢出了玩家 ${player.nickname as string}。原因：${reason.trim()}`,
    await getOperatorSnapshot(operatorId),
  );
};
