import type { OperationLog, WebsiteUserState } from '../types';

export const initialWebsiteUserState: WebsiteUserState = {
  currentAdminId: 'admin_root',
  admins: [
    {
      id: 'admin_root',
      username: 'root_admin',
      displayName: '主系统管理员',
      role: 'system_admin',
      password: 'Admin@123',
      email: 'root@kzguard.local',
      note: '拥有网站全部权限，可维护其他管理员账号。',
      createdAt: '2026-03-06T09:00:00.000Z',
      updatedAt: '2026-03-06T09:00:00.000Z',
    },
    {
      id: 'admin_ops',
      username: 'ops_manager',
      displayName: '运营管理员',
      role: 'normal_admin',
      password: 'Ops@1234',
      email: 'ops@kzguard.local',
      note: '负责日常社区与白名单审核。',
      createdAt: '2026-03-06T09:10:00.000Z',
      updatedAt: '2026-03-06T09:10:00.000Z',
    },
    {
      id: 'admin_review',
      username: 'review_guard',
      displayName: '审核管理员',
      role: 'normal_admin',
      password: 'Review@123',
      email: 'review@kzguard.local',
      note: '负责玩家申请初审与记录维护。',
      createdAt: '2026-03-06T09:20:00.000Z',
      updatedAt: '2026-03-06T09:20:00.000Z',
    },
  ],
};

export const initialOperationLogs: OperationLog[] = [
  {
    id: 'log_001',
    createdAt: '2026-03-06T09:35:00.000Z',
    operatorId: 'admin_root',
    operatorName: '主系统管理员',
    operatorRole: 'system_admin',
    action: 'admin_profile_updated',
    detail: '修改了 运营管理员 的备注信息，用于明确其负责社区与白名单日常维护。',
  },
  {
    id: 'log_002',
    createdAt: '2026-03-06T10:10:00.000Z',
    operatorId: 'admin_ops',
    operatorName: '运营管理员',
    operatorRole: 'normal_admin',
    action: 'community_created',
    detail: '新增社区 “HighTower KZ 社区”。',
  },
  {
    id: 'log_003',
    createdAt: '2026-03-06T10:30:00.000Z',
    operatorId: 'admin_review',
    operatorName: '审核管理员',
    operatorRole: 'normal_admin',
    action: 'whitelist_approved',
    detail: '审核通过玩家 KZRunner 的白名单申请。',
  },
];
