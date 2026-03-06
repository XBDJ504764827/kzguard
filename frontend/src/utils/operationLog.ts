import type { OperationLogAction } from '../types';

export const operationLogActionLabelMap: Record<OperationLogAction, string> = {
  community_created: '新增社区',
  server_created: '新增服务器',
  whitelist_approved: '通过白名单',
  whitelist_rejected: '拒绝白名单',
  whitelist_manual_added: '手动录入白名单',
  whitelist_application_simulated: '模拟玩家申请',
  admin_profile_updated: '修改管理员资料',
};
