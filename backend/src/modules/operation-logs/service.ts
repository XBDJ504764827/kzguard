import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { execute, mapOperationLogRows, queryRows } from '../../db/mysql.js';
import type { BanRecordOperator, OperationLogAction, OperationLogRecord } from '../../types/index.js';

export const listOperationLogs = async (): Promise<OperationLogRecord[]> => {
  const rows = await queryRows<RowDataPacket[]>('SELECT * FROM operation_logs ORDER BY created_at DESC');
  return mapOperationLogRows(rows);
};

export const appendOperationLog = async (
  action: OperationLogAction,
  detail: string,
  operator: BanRecordOperator,
): Promise<OperationLogRecord> => {
  const log: OperationLogRecord = {
    id: `log_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    operatorId: operator.id,
    operatorName: operator.name,
    operatorRole: operator.role,
    action,
    detail,
  };

  await execute(
    `INSERT INTO operation_logs (
      id, created_at, operator_id, operator_name, operator_role, action, detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [log.id, log.createdAt.slice(0, 23).replace('T', ' '), log.operatorId, log.operatorName, log.operatorRole, log.action, log.detail],
  );

  return log;
};
