import type { WebsiteAdminRole } from '../types';

export const websiteAdminRoleLabelMap: Record<WebsiteAdminRole, string> = {
  system_admin: '系统管理员',
  normal_admin: '普通管理员',
};

export const websiteAdminRoleColorMap: Record<WebsiteAdminRole, 'red' | 'arcoblue'> = {
  system_admin: 'red',
  normal_admin: 'arcoblue',
};

export const systemAdminOnlyFeatures = [
  '系统全局设置（待开发）',
  '管理员权限矩阵（待开发）',
  '站点操作审计（待开发）',
  '管理员批量启用/禁用（待开发）',
];

export const getPermissionSummary = (role: WebsiteAdminRole) => {
  if (role === 'system_admin') {
    return [
      '可手动录入、编辑、删除白名单玩家记录',
      '可审核所有玩家提交的白名单申请',
      '可管理管理员账号、角色与备注信息',
    ];
  }

  return [
    '仅可审核玩家主动提交的白名单申请',
    '拒绝白名单申请时必须填写缘由',
    '不可手动添加、编辑或删除白名单记录',
  ];
};
