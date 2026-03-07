import type { OperationLogAction } from '../types';

export const operationLogActionLabelMap: Record<OperationLogAction, string> = {
  community_created: '新增社区',
  community_updated: '编辑社区',
  community_deleted: '删除社区',
  server_created: '新增服务器',
  server_updated: '更新服务器设置',
  server_deleted: '删除服务器',
  server_player_kicked: '踢出服务器玩家',
  server_player_banned: '封禁服务器玩家',
  ban_record_manual_created: '手动添加封禁记录',
  ban_record_updated: '编辑封禁记录',
  ban_record_revoked: '解除封禁',
  ban_record_deleted: '删除封禁记录',
  whitelist_approved: '通过白名单',
  whitelist_rejected: '拒绝白名单',
  whitelist_manual_added: '手动录入白名单',
  whitelist_application_simulated: '模拟玩家申请',
  admin_created: '新增管理员',
  admin_profile_updated: '修改管理员资料',
};
