import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { seedAdmins, seedAppState, seedOperationLogs } from '../data/seed.js';
import { env } from '../config/env.js';
import type { BanRecord, CommunityRecord, OperationLogRecord, WebsiteAdminRecord, WhitelistPlayerRecord } from '../types/index.js';

let pool: Pool | null = null;

const toMySqlDateTime = (value: string) => value.slice(0, 23).replace('T', ' ');

export const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const createDatabaseIfNeeded = async () => {
  const connection = await mysql.createConnection({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(env.mysql.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await connection.end();
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('数据库尚未初始化');
  }

  return pool;
};

const createTables = async () => {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS communities (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS servers (
      id VARCHAR(64) PRIMARY KEY,
      community_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      ip VARCHAR(45) NOT NULL,
      port INT NOT NULL,
      rcon_password VARCHAR(255) NOT NULL,
      rcon_verified_at DATETIME(3) NOT NULL,
      whitelist_enabled TINYINT(1) NOT NULL DEFAULT 0,
      entry_verification_enabled TINYINT(1) NOT NULL DEFAULT 0,
      CONSTRAINT fk_servers_community FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
      INDEX idx_servers_community_id (community_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS server_players (
      id VARCHAR(64) PRIMARY KEY,
      server_id VARCHAR(64) NOT NULL,
      nickname VARCHAR(255) NOT NULL,
      steam_id VARCHAR(255) NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      connected_at DATETIME(3) NOT NULL,
      ping INT NOT NULL,
      CONSTRAINT fk_server_players_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      INDEX idx_server_players_server_id (server_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS whitelist_players (
      id VARCHAR(64) PRIMARY KEY,
      nickname VARCHAR(255) NOT NULL,
      steam_id VARCHAR(255) NOT NULL,
      contact VARCHAR(255) NULL,
      note TEXT NULL,
      status VARCHAR(32) NOT NULL,
      source VARCHAR(32) NOT NULL,
      applied_at DATETIME(3) NOT NULL,
      reviewed_at DATETIME(3) NULL,
      INDEX idx_whitelist_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ban_records (
      id VARCHAR(64) PRIMARY KEY,
      nickname VARCHAR(255) NULL,
      ban_type VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL,
      steam_identifier VARCHAR(255) NOT NULL,
      steam_id64 VARCHAR(32) NOT NULL,
      steam_id VARCHAR(255) NOT NULL,
      steam_id3 VARCHAR(255) NOT NULL,
      ip_address VARCHAR(45) NULL,
      reason TEXT NOT NULL,
      duration_seconds INT NULL,
      banned_at DATETIME(3) NOT NULL,
      server_name VARCHAR(255) NOT NULL,
      community_name VARCHAR(255) NULL,
      operator_id VARCHAR(64) NOT NULL,
      operator_name VARCHAR(255) NOT NULL,
      operator_role VARCHAR(32) NOT NULL,
      source VARCHAR(32) NOT NULL,
      updated_at DATETIME(3) NULL,
      revoked_at DATETIME(3) NULL,
      revoked_by_operator_id VARCHAR(64) NULL,
      revoked_by_operator_name VARCHAR(255) NULL,
      revoked_by_operator_role VARCHAR(32) NULL,
      INDEX idx_ban_status (status),
      INDEX idx_ban_type (ban_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS website_admins (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      display_name VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL,
      password VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL,
      note TEXT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id VARCHAR(64) PRIMARY KEY,
      created_at DATETIME(3) NOT NULL,
      operator_id VARCHAR(64) NOT NULL,
      operator_name VARCHAR(255) NOT NULL,
      operator_role VARCHAR(32) NOT NULL,
      action VARCHAR(64) NOT NULL,
      detail TEXT NOT NULL,
      INDEX idx_operation_logs_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const seedIfEmpty = async () => {
  const db = getPool();
  const [communityRows] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM communities');

  if ((communityRows[0]?.count as number) > 0) {
    return;
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    for (const community of seedAppState.communities) {
      await connection.execute<ResultSetHeader>(
        'INSERT INTO communities (id, name, created_at) VALUES (?, ?, ?)',
        [community.id, community.name, toMySqlDateTime(community.createdAt)],
      );

      for (const server of community.servers) {
        await connection.execute<ResultSetHeader>(
          `INSERT INTO servers (
            id, community_id, name, ip, port, rcon_password, rcon_verified_at, whitelist_enabled, entry_verification_enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            server.id,
            community.id,
            server.name,
            server.ip,
            server.port,
            server.rconPassword,
            toMySqlDateTime(server.rconVerifiedAt),
            server.whitelistEnabled ? 1 : 0,
            server.entryVerificationEnabled ? 1 : 0,
          ],
        );

        for (const player of server.onlinePlayers) {
          await connection.execute<ResultSetHeader>(
            `INSERT INTO server_players (
              id, server_id, nickname, steam_id, ip_address, connected_at, ping
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              player.id,
              server.id,
              player.nickname,
              player.steamId,
              player.ipAddress,
              toMySqlDateTime(player.connectedAt),
              player.ping,
            ],
          );
        }
      }
    }

    for (const player of seedAppState.whitelist) {
      await connection.execute<ResultSetHeader>(
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
          player.reviewedAt ? toMySqlDateTime(player.reviewedAt) : null,
        ],
      );
    }

    for (const ban of seedAppState.bans) {
      await connection.execute<ResultSetHeader>(
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
          ban.revokedAt ? toMySqlDateTime(ban.revokedAt) : null,
          ban.revokedByOperatorId ?? null,
          ban.revokedByOperatorName ?? null,
          ban.revokedByOperatorRole ?? null,
        ],
      );
    }

    for (const admin of seedAdmins) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO website_admins (
          id, username, display_name, role, password, email, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          admin.id,
          admin.username,
          admin.displayName,
          admin.role,
          admin.password,
          admin.email ?? null,
          admin.note ?? null,
          toMySqlDateTime(admin.createdAt),
          toMySqlDateTime(admin.updatedAt),
        ],
      );
    }

    for (const log of seedOperationLogs) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO operation_logs (
          id, created_at, operator_id, operator_name, operator_role, action, detail
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          log.id,
          toMySqlDateTime(log.createdAt),
          log.operatorId,
          log.operatorName,
          log.operatorRole,
          log.action,
          log.detail,
        ],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const initDatabase = async () => {
  if (pool) {
    return pool;
  }

  await createDatabaseIfNeeded();

  pool = mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    charset: 'utf8mb4',
  });

  await createTables();
  await seedIfEmpty();

  return pool;
};

export const queryRows = async <T extends RowDataPacket[]>(sql: string, params: any[] = []) => {
  const [rows] = await getPool().query<T>(sql, params);
  return rows;
};

export const execute = async (sql: string, params: any[] = []) => {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
};

export const withTransaction = async <T>(runner: (connection: PoolConnection) => Promise<T>) => {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const result = await runner(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const mapCommunityRows = (
  communityRows: RowDataPacket[],
  serverRows: RowDataPacket[],
  playerRows: RowDataPacket[],
): CommunityRecord[] => {
  const playerMap = new Map<string, CommunityRecord['servers'][number]['onlinePlayers']>();

  for (const playerRow of playerRows) {
    const currentPlayers = playerMap.get(playerRow.server_id as string) ?? [];
    currentPlayers.push({
      id: playerRow.id as string,
      nickname: playerRow.nickname as string,
      steamId: playerRow.steam_id as string,
      ipAddress: playerRow.ip_address as string,
      connectedAt: toIsoString(playerRow.connected_at as Date)!,
      ping: Number(playerRow.ping),
    });
    playerMap.set(playerRow.server_id as string, currentPlayers);
  }

  const serverMap = new Map<string, CommunityRecord['servers']>();

  for (const serverRow of serverRows) {
    const currentServers = serverMap.get(serverRow.community_id as string) ?? [];
    currentServers.push({
      id: serverRow.id as string,
      name: serverRow.name as string,
      ip: serverRow.ip as string,
      port: Number(serverRow.port),
      rconPassword: serverRow.rcon_password as string,
      rconVerifiedAt: toIsoString(serverRow.rcon_verified_at as Date)!,
      whitelistEnabled: Boolean(serverRow.whitelist_enabled),
      entryVerificationEnabled: Boolean(serverRow.entry_verification_enabled),
      onlinePlayers: playerMap.get(serverRow.id as string) ?? [],
    });
    serverMap.set(serverRow.community_id as string, currentServers);
  }

  return communityRows.map((communityRow) => ({
    id: communityRow.id as string,
    name: communityRow.name as string,
    createdAt: toIsoString(communityRow.created_at as Date)!,
    servers: serverMap.get(communityRow.id as string) ?? [],
  }));
};

export const mapWhitelistRows = (rows: RowDataPacket[]): WhitelistPlayerRecord[] =>
  rows.map((row) => ({
    id: row.id as string,
    nickname: row.nickname as string,
    steamId: row.steam_id as string,
    contact: (row.contact as string | null) ?? undefined,
    note: (row.note as string | null) ?? undefined,
    status: row.status as WhitelistPlayerRecord['status'],
    source: row.source as WhitelistPlayerRecord['source'],
    appliedAt: toIsoString(row.applied_at as Date)!,
    reviewedAt: toIsoString((row.reviewed_at as Date | null) ?? undefined),
  }));

export const mapBanRows = (rows: RowDataPacket[]): BanRecord[] =>
  rows.map((row) => ({
    id: row.id as string,
    nickname: (row.nickname as string | null) ?? undefined,
    banType: row.ban_type as BanRecord['banType'],
    status: row.status as BanRecord['status'],
    steamIdentifier: row.steam_identifier as string,
    steamId64: row.steam_id64 as string,
    steamId: row.steam_id as string,
    steamId3: row.steam_id3 as string,
    ipAddress: (row.ip_address as string | null) ?? undefined,
    reason: row.reason as string,
    durationSeconds: row.duration_seconds === null ? undefined : Number(row.duration_seconds),
    bannedAt: toIsoString(row.banned_at as Date)!,
    serverName: row.server_name as string,
    communityName: (row.community_name as string | null) ?? undefined,
    operatorId: row.operator_id as string,
    operatorName: row.operator_name as string,
    operatorRole: row.operator_role as BanRecord['operatorRole'],
    source: row.source as BanRecord['source'],
    updatedAt: toIsoString((row.updated_at as Date | null) ?? undefined),
    revokedAt: toIsoString((row.revoked_at as Date | null) ?? undefined),
    revokedByOperatorId: (row.revoked_by_operator_id as string | null) ?? undefined,
    revokedByOperatorName: (row.revoked_by_operator_name as string | null) ?? undefined,
    revokedByOperatorRole: (row.revoked_by_operator_role as BanRecord['operatorRole'] | null) ?? undefined,
  }));

export const mapAdminRows = (rows: RowDataPacket[]): WebsiteAdminRecord[] =>
  rows.map((row) => ({
    id: row.id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    role: row.role as WebsiteAdminRecord['role'],
    password: row.password as string,
    email: (row.email as string | null) ?? undefined,
    note: (row.note as string | null) ?? undefined,
    createdAt: toIsoString(row.created_at as Date)!,
    updatedAt: toIsoString(row.updated_at as Date)!,
  }));

export const mapOperationLogRows = (rows: RowDataPacket[]): OperationLogRecord[] =>
  rows.map((row) => ({
    id: row.id as string,
    createdAt: toIsoString(row.created_at as Date)!,
    operatorId: row.operator_id as string,
    operatorName: row.operator_name as string,
    operatorRole: row.operator_role as OperationLogRecord['operatorRole'],
    action: row.action as OperationLogRecord['action'],
    detail: row.detail as string,
  }));
