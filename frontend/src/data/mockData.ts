import type { AppState } from '../types';

export const initialState: AppState = {
  communities: [
    {
      id: 'community_hightower',
      name: 'HighTower KZ 社区',
      createdAt: '2026-03-06T12:00:00.000Z',
      servers: [
        {
          id: 'server_hightower_1',
          name: 'Hightower #1 Beginner',
          ip: '45.32.18.20',
          port: 27015,
          rconPassword: 'rcon-demo-01',
          rconVerifiedAt: '2026-03-06T12:05:00.000Z',
        },
      ],
    },
    {
      id: 'community_skyline',
      name: 'Skyline Climb 社区',
      createdAt: '2026-03-05T08:30:00.000Z',
      servers: [
        {
          id: 'server_skyline_1',
          name: 'Skyline #2 Pro',
          ip: '103.21.244.88',
          port: 27016,
          rconPassword: 'rcon-demo-02',
          rconVerifiedAt: '2026-03-05T09:00:00.000Z',
        },
        {
          id: 'server_skyline_2',
          name: 'Skyline #3 Fastcup',
          ip: '103.21.244.89',
          port: 27017,
          rconPassword: 'rcon-demo-03',
          rconVerifiedAt: '2026-03-05T09:10:00.000Z',
        },
      ],
    },
  ],
  whitelist: [
    {
      id: 'player_approved_1',
      nickname: 'KZRunner',
      steamId: 'STEAM_1:1:120001',
      contact: 'qq: 223344',
      note: '比赛服常驻玩家',
      status: 'approved',
      source: 'manual',
      appliedAt: '2026-03-04T13:10:00.000Z',
      reviewedAt: '2026-03-04T14:20:00.000Z',
    },
    {
      id: 'player_pending_1',
      nickname: 'LongJump',
      steamId: 'STEAM_1:0:889911',
      contact: 'discord: longjump',
      note: '申请进入训练服',
      status: 'pending',
      source: 'application',
      appliedAt: '2026-03-06T10:15:00.000Z',
    },
    {
      id: 'player_pending_2',
      nickname: 'CliffSide',
      steamId: 'STEAM_1:0:901245',
      contact: 'qq: 556677',
      note: '新玩家，等待审核',
      status: 'pending',
      source: 'application',
      appliedAt: '2026-03-06T11:20:00.000Z',
    },
    {
      id: 'player_rejected_1',
      nickname: 'WallBug',
      steamId: 'STEAM_1:1:765432',
      contact: 'qq: 889900',
      note: '资料不完整',
      status: 'rejected',
      source: 'manual',
      appliedAt: '2026-03-03T15:40:00.000Z',
      reviewedAt: '2026-03-03T16:00:00.000Z',
    },
  ],
};
