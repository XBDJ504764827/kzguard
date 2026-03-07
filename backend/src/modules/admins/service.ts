import type { RowDataPacket } from 'mysql2/promise';
import { execute, mapAdminRows, queryRows } from '../../db/mysql.js';
import type { BanRecordOperator, WebsiteAdminRecord, WebsiteAdminUpdateDraft } from '../../types/index.js';
import { HttpError } from '../../utils/errors.js';
import { validateWebsiteAdminUpdateDraft } from '../../utils/validation.js';
import { appendOperationLog } from '../operation-logs/service.js';

export const listWebsiteAdmins = async (): Promise<WebsiteAdminRecord[]> => {
  const rows = await queryRows<RowDataPacket[]>('SELECT * FROM website_admins ORDER BY created_at ASC');
  return mapAdminRows(rows);
};

export const getOperatorSnapshot = async (operatorId?: string, options?: { allowFallback?: boolean }): Promise<BanRecordOperator> => {
  const admins = await listWebsiteAdmins();

  if (!admins.length) {
    throw new HttpError(500, '管理员数据未初始化');
  }

  const matchedAdmin = operatorId ? admins.find((admin) => admin.id === operatorId) : undefined;
  const fallbackAdmin = options?.allowFallback === false ? undefined : admins[0];
  const operator = matchedAdmin ?? fallbackAdmin;

  if (!operator) {
    throw new HttpError(401, '未识别当前操作管理员');
  }

  return {
    id: operator.id,
    name: operator.displayName,
    role: operator.role,
  };
};

export const updateWebsiteAdmin = async (
  adminId: string,
  draft: WebsiteAdminUpdateDraft,
  operatorId?: string,
): Promise<WebsiteAdminRecord> => {
  validateWebsiteAdminUpdateDraft(draft);

  const admins = await listWebsiteAdmins();
  const currentAdmin = await getOperatorSnapshot(operatorId, { allowFallback: false });
  const currentAdminRecord = admins.find((admin) => admin.id === currentAdmin.id);
  const targetAdmin = admins.find((admin) => admin.id === adminId);

  if (!currentAdminRecord || !targetAdmin) {
    throw new HttpError(404, '未找到目标管理员');
  }

  const isSelfEdit = currentAdminRecord.id === adminId;
  const isSystemAdmin = currentAdminRecord.role === 'system_admin';

  if (!isSystemAdmin && !isSelfEdit) {
    throw new HttpError(403, '普通管理员只能编辑自己的信息');
  }

  const nextUsername = draft.username.trim();
  const nextDisplayName = draft.displayName.trim();
  const nextEmail = draft.email?.trim() || undefined;
  const nextNote = draft.note?.trim() || undefined;
  const nextPassword = draft.password.trim() ? draft.password.trim() : targetAdmin.password;
  const nextRole = isSystemAdmin ? draft.role : targetAdmin.role;

  const hasDuplicateUsername = admins.some(
    (admin) => admin.id !== adminId && admin.username.toLowerCase() === nextUsername.toLowerCase(),
  );

  if (hasDuplicateUsername) {
    throw new HttpError(400, '用户名已存在，请更换其他用户名');
  }

  const remainingSystemAdminCount = admins.filter(
    (admin) => admin.id !== adminId && admin.role === 'system_admin',
  ).length;

  if (targetAdmin.role === 'system_admin' && nextRole !== 'system_admin' && remainingSystemAdminCount === 0) {
    throw new HttpError(400, '系统中至少需要保留一名系统管理员');
  }

  const updatedAt = new Date().toISOString();

  await execute(
    `UPDATE website_admins
      SET username = ?, display_name = ?, role = ?, password = ?, email = ?, note = ?, updated_at = ?
      WHERE id = ?`,
    [nextUsername, nextDisplayName, nextRole, nextPassword, nextEmail ?? null, nextNote ?? null, updatedAt.slice(0, 23).replace('T', ' '), adminId],
  );

  const updatedAdmin: WebsiteAdminRecord = {
    ...targetAdmin,
    username: nextUsername,
    displayName: nextDisplayName,
    role: nextRole,
    password: nextPassword,
    email: nextEmail,
    note: nextNote,
    updatedAt,
  };

  await appendOperationLog(
    'admin_profile_updated',
    isSelfEdit
      ? `修改了自己的管理员资料，当前用户名为 ${updatedAdmin.username}。`
      : `修改了管理员 ${targetAdmin.displayName} 的资料，当前用户名为 ${updatedAdmin.username}。`,
    {
      id: currentAdminRecord.id,
      name: currentAdminRecord.displayName,
      role: currentAdminRecord.role,
    },
  );

  return updatedAdmin;
};
