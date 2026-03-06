import type { WebsiteUserState } from '../types';

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
