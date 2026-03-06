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
      '可查看并编辑所有管理员资料、用户名和密码',
      '可调整管理员角色与备注信息',
      '可查看系统管理员专属功能占位区',
    ];
  }

  return [
    '仅可编辑自己的资料、用户名和密码',
    '不可编辑其他管理员账号信息',
    '系统级功能区域当前保持隐藏，等待后续设计',
  ];
};
